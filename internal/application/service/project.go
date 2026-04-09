package service

import (
	"context"
	stderrors "errors"
	"time"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"gorm.io/gorm"
)

type projectService struct {
	repo           interfaces.ProjectRepository
	kbService      interfaces.KnowledgeBaseService
	sessionRepo    interfaces.SessionRepository
	sessionService interfaces.SessionService
}

// NewProjectService constructs the MetaNote project service.
func NewProjectService(
	repo interfaces.ProjectRepository,
	kbService interfaces.KnowledgeBaseService,
	sessionRepo interfaces.SessionRepository,
	sessionService interfaces.SessionService,
) interfaces.ProjectService {
	return &projectService{
		repo:           repo,
		kbService:      kbService,
		sessionRepo:    sessionRepo,
		sessionService: sessionService,
	}
}

func (s *projectService) CreateProject(ctx context.Context, name string, description string) (*types.Project, error) {
	if name == "" {
		return nil, stderrors.New("project name is required")
	}
	// Model IDs are filled by CreateKnowledgeBase using platform built-ins + is_default (same as manual KB creation).
	kb := &types.KnowledgeBase{
		Name:        name,
		Description: description,
		Type:        types.KnowledgeBaseTypeDocument,
	}
	kb, err := s.kbService.CreateKnowledgeBase(ctx, kb)
	if err != nil {
		return nil, err
	}
	proj := &types.Project{
		TenantID:        types.MustTenantIDFromContext(ctx),
		Name:            name,
		KnowledgeBaseID: kb.ID,
	}
	if err := s.repo.Create(ctx, proj); err != nil {
		return nil, err
	}
	logger.Infof(ctx, "Created project id=%s uuid=%s kb=%s", proj.ID, proj.UUID, kb.ID)
	return proj, nil
}

func (s *projectService) GetProject(ctx context.Context, id string) (*types.Project, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	return s.repo.GetByID(ctx, tenantID, id)
}

func (s *projectService) GetProjectByUUID(ctx context.Context, uuid string) (*types.Project, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	return s.repo.GetByUUID(ctx, tenantID, uuid)
}

func (s *projectService) ListProjects(ctx context.Context, page *types.Pagination) ([]*types.Project, int64, error) {
	tenantID := types.MustTenantIDFromContext(ctx)
	return s.repo.ListByTenant(ctx, tenantID, page)
}

func (s *projectService) UpdateProject(ctx context.Context, id string, name string) (*types.Project, error) {
	if name == "" {
		return nil, stderrors.New("name is required")
	}
	p, err := s.GetProject(ctx, id)
	if err != nil {
		return nil, err
	}
	p.Name = name
	p.UpdatedAt = time.Now()
	if err := s.repo.Update(ctx, p); err != nil {
		return nil, err
	}
	if _, err := s.kbService.UpdateKnowledgeBase(ctx, p.KnowledgeBaseID, name, "", nil); err != nil {
		logger.Warnf(ctx, "Failed to rename linked knowledge base %s: %v", p.KnowledgeBaseID, err)
	}
	return s.GetProject(ctx, id)
}

func (s *projectService) DeleteProject(ctx context.Context, id string) error {
	p, err := s.GetProject(ctx, id)
	if err != nil {
		if stderrors.Is(err, gorm.ErrRecordNotFound) {
			return stderrors.New("project not found")
		}
		return err
	}
	tenantID := types.MustTenantIDFromContext(ctx)
	ids, err := s.sessionRepo.ListSessionIDsByProject(ctx, tenantID, id)
	if err != nil {
		return err
	}
	if len(ids) > 0 {
		if err := s.sessionService.BatchDeleteSessions(ctx, ids); err != nil {
			return err
		}
	}
	if err := s.kbService.DeleteKnowledgeBase(ctx, p.KnowledgeBaseID); err != nil {
		return err
	}
	return s.repo.Delete(ctx, tenantID, id)
}
