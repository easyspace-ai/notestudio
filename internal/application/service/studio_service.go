package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/models/chat"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

type studioService struct {
	repo         interfaces.StudioJobRepository
	projectRepo  interfaces.ProjectRepository
	tenantRepo   interfaces.TenantRepository
	task         interfaces.TaskEnqueuer
	modelService interfaces.ModelService
	fileService  interfaces.FileService
	msgService   interfaces.MessageService
	skillService interfaces.SkillService
}

// NewStudioService constructs the Studio API + async processor.
func NewStudioService(
	repo interfaces.StudioJobRepository,
	projectRepo interfaces.ProjectRepository,
	tenantRepo interfaces.TenantRepository,
	task interfaces.TaskEnqueuer,
	modelService interfaces.ModelService,
	fileService interfaces.FileService,
	msgService interfaces.MessageService,
	skillService interfaces.SkillService,
) interfaces.StudioService {
	return &studioService{
		repo:         repo,
		projectRepo:  projectRepo,
		tenantRepo:   tenantRepo,
		task:         task,
		modelService: modelService,
		fileService:  fileService,
		msgService:   msgService,
		skillService: skillService,
	}
}

func (s *studioService) CreateJob(ctx context.Context, projectUUID, kind, title string, sessionID *string) (*types.StudioJob, error) {
	kind = strings.TrimSpace(strings.ToLower(kind))
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, errors.New("title is required")
	}
	switch kind {
	case types.StudioKindHTML, types.StudioKindSlides, types.StudioKindAudio, types.StudioKindMindmap:
	default:
		return nil, fmt.Errorf("unsupported studio kind: %s", kind)
	}

	tenantID := types.MustTenantIDFromContext(ctx)
	p, err := s.projectRepo.GetByUUID(ctx, tenantID, projectUUID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("project not found")
		}
		return nil, err
	}

	job := &types.StudioJob{
		TenantID:  tenantID,
		ProjectID: p.ID,
		Kind:      kind,
		Title:     title,
		Status:    types.StudioJobStatusPending,
		SessionID: sessionID,
	}
	if err := s.repo.Create(ctx, job); err != nil {
		return nil, err
	}

	lang, _ := types.LanguageFromContext(ctx)
	payload := types.StudioGeneratePayload{
		RequestID:       uuid.New().String(),
		TenantID:        tenantID,
		JobID:           job.ID,
		ProjectID:       p.ID,
		KnowledgeBaseID: p.KnowledgeBaseID,
		Kind:            kind,
		Title:           title,
		Language:        lang,
	}
	if sessionID != nil {
		payload.SessionID = *sessionID
	}
	b, err := json.Marshal(payload)
	if err != nil {
		job.Status = types.StudioJobStatusFailed
		job.ErrorMessage = err.Error()
		_ = s.repo.Save(ctx, job)
		return nil, err
	}

	t := asynq.NewTask(types.TypeStudioGenerate, b, asynq.Queue("default"), asynq.MaxRetry(2))
	if _, err := s.task.Enqueue(t); err != nil {
		job.Status = types.StudioJobStatusFailed
		job.ErrorMessage = fmt.Sprintf("enqueue: %v", err)
		_ = s.repo.Save(ctx, job)
		return nil, fmt.Errorf("failed to enqueue studio task: %w", err)
	}
	return job, nil
}

func (s *studioService) GetJob(ctx context.Context, id string) (*types.StudioJob, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	return s.repo.GetByID(ctx, tenantID, id)
}

func (s *studioService) ListJobs(ctx context.Context, projectUUID string, page *types.Pagination) ([]*types.StudioJob, int64, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	p, err := s.projectRepo.GetByUUID(ctx, tenantID, projectUUID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, 0, errors.New("project not found")
		}
		return nil, 0, err
	}
	return s.repo.ListByProject(ctx, tenantID, p.ID, page)
}

// ProcessGenerateTask executes the async Studio pipeline (Asynq worker or sync executor).
func (s *studioService) ProcessGenerateTask(ctx context.Context, payload *types.StudioGeneratePayload) error {
	if payload == nil {
		return nil
	}
	ctx = logger.WithRequestID(ctx, payload.RequestID)
	ctx = context.WithValue(ctx, types.TenantIDContextKey, payload.TenantID)
	if payload.Language != "" {
		ctx = context.WithValue(ctx, types.LanguageContextKey, payload.Language)
	}
	ti, err := s.tenantRepo.GetTenantByID(ctx, payload.TenantID)
	if err != nil {
		logger.Errorf(ctx, "studio: tenant %d: %v", payload.TenantID, err)
		return nil
	}
	ctx = context.WithValue(ctx, types.TenantInfoContextKey, ti)

	job, err := s.repo.GetByID(ctx, payload.TenantID, payload.JobID)
	if err != nil {
		logger.Errorf(ctx, "studio: job %s: %v", payload.JobID, err)
		return nil
	}

	job.Status = types.StudioJobStatusRunning
	if err := s.repo.Save(ctx, job); err != nil {
		return err
	}

	switch strings.ToLower(payload.Kind) {
	case types.StudioKindHTML, types.StudioKindSlides:
		err = s.runHTMLJob(ctx, job, payload)
	default:
		err = fmt.Errorf("studio kind %q is not implemented yet (only %s and %s are supported)", payload.Kind, types.StudioKindHTML, types.StudioKindSlides)
	}

	if err != nil {
		job.Status = types.StudioJobStatusFailed
		job.ErrorMessage = err.Error()
		_ = s.repo.Save(ctx, job)
		logger.Errorf(ctx, "studio job %s failed: %v", job.ID, err)
		return nil
	}

	job.Status = types.StudioJobStatusSucceeded
	if err := s.repo.Save(ctx, job); err != nil {
		return err
	}
	logger.Infof(ctx, "studio job %s succeeded kind=%s", job.ID, payload.Kind)
	return nil
}

// stripMarkdownHTMLFence removes leading/trailing ``` fences (optional `html` language line) so saved HTML is valid in browsers.
func stripMarkdownHTMLFence(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	rest := strings.TrimPrefix(s, "```")
	rest = strings.TrimLeft(rest, "\r\n")
	if nl := strings.IndexByte(rest, '\n'); nl >= 0 {
		first := strings.TrimSpace(rest[:nl])
		if first != "" && !strings.HasPrefix(strings.TrimSpace(first), "<") {
			rest = rest[nl+1:]
		}
	}
	rest = strings.TrimSpace(rest)
	rest = strings.TrimSuffix(rest, "```")
	return strings.TrimSpace(rest)
}

func (s *studioService) runHTMLJob(ctx context.Context, job *types.StudioJob, payload *types.StudioGeneratePayload) error {
	models, err := s.modelService.ListModels(ctx)
	if err != nil {
		return err
	}
	qaID := PickPreferredActiveModelID(models, types.ModelTypeKnowledgeQA)
	if qaID == "" {
		return errors.New("no active KnowledgeQA chat model configured (set a platform default built-in model)")
	}

	ch, err := s.modelService.GetChatModel(ctx, qaID)
	if err != nil {
		return fmt.Errorf("chat model: %w", err)
	}

	var transcript strings.Builder
	if strings.TrimSpace(payload.SessionID) != "" {
		msgs, err := s.msgService.GetMessagesBySession(ctx, payload.SessionID, 1, 80)
		if err == nil && len(msgs) > 0 {
			for _, m := range msgs {
				role := m.Role
				if role == "" {
					role = "user"
				}
				transcript.WriteString(fmt.Sprintf("%s: %s\n", role, m.Content))
			}
		}
	}

	lang := payload.Language
	if lang == "" {
		lang = "zh-CN"
	}

	// Load webpage-generator skill instructions for better HTML generation quality
	var skillContent string
	if s.skillService != nil {
		skillCtx := context.Background()
		skill, err := s.skillService.GetSkillByName(skillCtx, "webpage-generator")
		if err == nil && skill != nil {
			skillContent = skill.Instructions
			logger.Infof(ctx, "studio: loaded webpage-generator skill for job %s", job.ID)
		} else {
			logger.Warnf(ctx, "studio: failed to load webpage-generator skill for job %s: %v", job.ID, err)
		}
	}

	sys := fmt.Sprintf(`You are a professional web designer and frontend developer. Create a beautiful, modern, and visually appealing HTML5 webpage.

Design Requirements:
- Use Tailwind CSS via CDN for styling (https://cdn.tailwindcss.com)
- Apply a cohesive, modern color palette with primary/secondary colors (e.g., indigo/blue gradients, emerald accents)
- Use gradient backgrounds, soft shadows, and rounded corners for visual depth
- Implement responsive design that works on all devices
- Add hover effects and subtle animations for interactivity
- Use modern typography with proper hierarchy (Inter or system fonts)
- Include visual elements like icons (Lucide icons or inline SVG)
- Ensure proper spacing and layout using flexbox/grid
- Add a clean navigation bar and footer for completeness
- Use cards, badges, pills, and other modern UI components
- Apply accent colors for highlights, call-to-action buttons, and key information

Technical Requirements:
- Single self-contained HTML5 document
- Use language/locale: %s
- Output ONLY raw HTML, no markdown code fences.`, lang)
	if skillContent != "" {
		sys += "\n\nFollow the skill instructions below when generating the HTML page:\n" + skillContent
	}

	user := fmt.Sprintf("Page title / topic: %s\n\n", payload.Title)
	if transcript.Len() > 0 {
		user += "Context from project chat (optional):\n" + transcript.String() + "\n\n"
	}
	user += "Produce a complete <!DOCTYPE html> document with <head> and <body>."

	resp, err := ch.Chat(ctx, []chat.Message{
		{Role: "system", Content: sys},
		{Role: "user", Content: user},
	}, &chat.ChatOptions{MaxTokens: 8192})
	if err != nil {
		return err
	}
	html := stripMarkdownHTMLFence(strings.TrimSpace(resp.Content))
	if html == "" {
		return errors.New("empty model response")
	}

	fname := fmt.Sprintf("studio-%s.html", job.ID)
	path, err := s.fileService.SaveBytes(ctx, []byte(html), payload.TenantID, fname, false)
	if err != nil {
		return fmt.Errorf("save artifact: %w", err)
	}
	job.ArtifactPath = path

	url, _ := s.fileService.GetFileURL(ctx, path)
	meta, _ := json.Marshal(map[string]string{
		"file_path": path,
		"file_url":  url,
	})
	job.Artifacts = types.JSON(meta)
	return nil
}
