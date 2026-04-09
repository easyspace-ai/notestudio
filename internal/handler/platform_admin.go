package handler

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	secutils "github.com/Tencent/WeKnora/internal/utils"
	"github.com/gin-gonic/gin"
)

// PlatformAdminHandler is the SaaS operator API (models, cross-tenant KB/sessions).
type PlatformAdminHandler struct {
	AdminSvc   interfaces.PlatformAdminAuthService
	ModelRepo  interfaces.ModelRepository
	ModelSvc   interfaces.ModelService
	KBRepo     interfaces.KnowledgeBaseRepository
	SessRepo   interfaces.SessionRepository
	SkillSvc   interfaces.SkillService
}

// NewPlatformAdminHandler constructs PlatformAdminHandler.
func NewPlatformAdminHandler(
	adminSvc interfaces.PlatformAdminAuthService,
	modelRepo interfaces.ModelRepository,
	modelSvc interfaces.ModelService,
	kbRepo interfaces.KnowledgeBaseRepository,
	sessRepo interfaces.SessionRepository,
	skillSvc interfaces.SkillService,
) *PlatformAdminHandler {
	return &PlatformAdminHandler{
		AdminSvc:  adminSvc,
		ModelRepo: modelRepo,
		ModelSvc:  modelSvc,
		KBRepo:    kbRepo,
		SessRepo:  sessRepo,
		SkillSvc:  skillSvc,
	}
}

type platformAdminLoginBody struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login POST /api/v1/admin/auth/login
func (h *PlatformAdminHandler) Login(c *gin.Context) {
	ctx := c.Request.Context()
	var body platformAdminLoginBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	token, adm, err := h.AdminSvc.Login(ctx, body.Email, body.Password)
	if err != nil {
		logger.Warnf(ctx, "platform admin login failed: %v", err)
		c.Error(apperrors.NewUnauthorizedError("invalid email or password"))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"access_token": token,
			"admin": gin.H{
				"id":    adm.ID,
				"email": adm.Email,
			},
		},
	})
}

// ListPlatformModels GET /api/v1/admin/models
func (h *PlatformAdminHandler) ListPlatformModels(c *gin.Context) {
	ctx := c.Request.Context()
	list, err := h.ModelRepo.ListAllPlatformModels(ctx)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list})
}

func mergePlatformModelParameters(dst, src types.ModelParameters) types.ModelParameters {
	out := dst
	if src.BaseURL != "" {
		out.BaseURL = src.BaseURL
	}
	if src.APIKey != "" {
		out.APIKey = src.APIKey
	}
	if src.Provider != "" {
		out.Provider = src.Provider
	}
	if src.InterfaceType != "" {
		out.InterfaceType = src.InterfaceType
	}
	if src.EmbeddingParameters.Dimension > 0 {
		out.EmbeddingParameters.Dimension = src.EmbeddingParameters.Dimension
	}
	if src.EmbeddingParameters.TruncatePromptTokens != 0 {
		out.EmbeddingParameters.TruncatePromptTokens = src.EmbeddingParameters.TruncatePromptTokens
	}
	if src.ParameterSize != "" {
		out.ParameterSize = src.ParameterSize
	}
	if src.ExtraConfig != nil {
		out.ExtraConfig = src.ExtraConfig
	}
	out.SupportsVision = src.SupportsVision
	return out
}

func (h *PlatformAdminHandler) builtinModelTenantID(ctx context.Context) (uint64, error) {
	list, err := h.ModelRepo.ListAllPlatformModels(ctx)
	if err != nil {
		return 0, err
	}
	for _, m := range list {
		if m != nil && m.TenantID != 0 {
			return m.TenantID, nil
		}
	}
	return 10000, nil
}

type createPlatformModelBody struct {
	Name        string                `json:"name"        binding:"required"`
	Type        types.ModelType       `json:"type"        binding:"required"`
	Source      types.ModelSource     `json:"source"      binding:"required"`
	Description string                `json:"description"`
	Parameters  types.ModelParameters `json:"parameters"  binding:"required"`
}

// CreatePlatformModel POST /api/v1/admin/models — creates a built-in (platform) model row.
func (h *PlatformAdminHandler) CreatePlatformModel(c *gin.Context) {
	ctx := c.Request.Context()
	var body createPlatformModelBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	if body.Parameters.BaseURL != "" {
		if err := secutils.ValidateURLForSSRF(body.Parameters.BaseURL); err != nil {
			c.Error(apperrors.NewBadRequestError(fmt.Sprintf("Base URL 未通过安全校验: %v", err)))
			return
		}
	}
	tid, err := h.builtinModelTenantID(ctx)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	model := &types.Model{
		TenantID:    tid,
		Name:        secutils.SanitizeForLog(body.Name),
		Type:        types.ModelType(secutils.SanitizeForLog(string(body.Type))),
		Source:      body.Source,
		Description: secutils.SanitizeForLog(body.Description),
		Parameters:  body.Parameters,
		IsBuiltin:   true,
		IsDefault:   false,
	}
	if err := h.ModelSvc.CreateModel(ctx, model); err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": model})
}

// DeletePlatformModel DELETE /api/v1/admin/models/:id — removes a built-in model row.
func (h *PlatformAdminHandler) DeletePlatformModel(c *gin.Context) {
	ctx := c.Request.Context()
	id := secutils.SanitizeForLog(c.Param("id"))
	if id == "" {
		c.Error(apperrors.NewBadRequestError("model id required"))
		return
	}
	existing, err := h.ModelRepo.GetBuiltInByID(ctx, id)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	if existing == nil {
		c.Error(apperrors.NewNotFoundError("built-in model not found"))
		return
	}
	if err := h.ModelRepo.Delete(ctx, existing.TenantID, id); err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "deleted"})
}

type updatePlatformModelBody struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Parameters  types.ModelParameters `json:"parameters"`
	IsDefault   *bool              `json:"is_default"`
	Status      types.ModelStatus  `json:"status"`
}

// UpdatePlatformModel PUT /api/v1/admin/models/:id
func (h *PlatformAdminHandler) UpdatePlatformModel(c *gin.Context) {
	ctx := c.Request.Context()
	id := secutils.SanitizeForLog(c.Param("id"))
	if id == "" {
		c.Error(apperrors.NewBadRequestError("model id required"))
		return
	}
	existing, err := h.ModelRepo.GetBuiltInByID(ctx, id)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	if existing == nil {
		c.Error(apperrors.NewNotFoundError("built-in model not found"))
		return
	}
	var body updatePlatformModelBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	if body.Name != "" {
		existing.Name = body.Name
	}
	if body.Description != "" {
		existing.Description = body.Description
	}
	if body.Parameters.BaseURL != "" {
		if err := secutils.ValidateURLForSSRF(body.Parameters.BaseURL); err != nil {
			c.Error(apperrors.NewBadRequestError(fmt.Sprintf("Base URL 未通过安全校验: %v", err)))
			return
		}
	}
	existing.Parameters = mergePlatformModelParameters(existing.Parameters, body.Parameters)
	if body.IsDefault != nil && *body.IsDefault {
		_ = h.ModelRepo.ClearDefaultByType(ctx, uint(existing.TenantID), existing.Type, existing.ID)
		existing.IsDefault = true
	} else if body.IsDefault != nil {
		existing.IsDefault = *body.IsDefault
	}
	if body.Status != "" {
		existing.Status = body.Status
	}
	if err := h.ModelRepo.UpdatePlatformModel(ctx, existing); err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": existing})
}

// ListAllKnowledgeBases GET /api/v1/admin/knowledge-bases
func (h *PlatformAdminHandler) ListAllKnowledgeBases(c *gin.Context) {
	ctx := c.Request.Context()
	list, err := h.KBRepo.ListAllNonTemporaryForAdmin(ctx)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	for _, kb := range list {
		kb.EnsureDefaults()
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list})
}

// ListAllSessions GET /api/v1/admin/sessions?page=&page_size=
func (h *PlatformAdminHandler) ListAllSessions(c *gin.Context) {
	ctx := c.Request.Context()
	var page types.Pagination
	if err := c.ShouldBindQuery(&page); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	list, total, err := h.SessRepo.ListAllPaged(ctx, &page)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      list,
		"total":     total,
		"page":      page.GetPage(),
		"page_size": page.GetPageSize(),
	})
}

func adminSkillNameFromParam(c *gin.Context) (string, error) {
	raw := strings.TrimSpace(c.Param("name"))
	if raw == "" {
		return "", fmt.Errorf("empty skill name")
	}
	dec, err := url.PathUnescape(raw)
	if err != nil {
		dec = raw
	}
	dec = strings.TrimSpace(dec)
	if dec == "" || strings.Contains(dec, "/") || strings.Contains(dec, "\\") || strings.Contains(dec, "..") {
		return "", fmt.Errorf("invalid skill name")
	}
	return dec, nil
}

// ListAdminSkills GET /api/v1/admin/skills
func (h *PlatformAdminHandler) ListAdminSkills(c *gin.Context) {
	ctx := c.Request.Context()
	list, err := h.SkillSvc.ListSkillsForAdmin(ctx)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": list})
}

// GetAdminSkill GET /api/v1/admin/skills/:name
func (h *PlatformAdminHandler) GetAdminSkill(c *gin.Context) {
	ctx := c.Request.Context()
	name, err := adminSkillNameFromParam(c)
	if err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	detail, err := h.SkillSvc.GetSkillDetailForAdmin(ctx, name)
	if err != nil {
		c.Error(apperrors.NewNotFoundError("skill not found"))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": detail})
}

type updateAdminSkillBody struct {
	Content string `json:"content" binding:"required"`
}

// UpdateAdminSkill PUT /api/v1/admin/skills/:name — replace SKILL.md (validated).
func (h *PlatformAdminHandler) UpdateAdminSkill(c *gin.Context) {
	ctx := c.Request.Context()
	name, err := adminSkillNameFromParam(c)
	if err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	var body updateAdminSkillBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	if err := h.SkillSvc.UpdateSkillFile(ctx, name, body.Content); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "updated"})
}

type patchAdminSkillBody struct {
	Enabled bool `json:"enabled"`
}

// PatchAdminSkill PATCH /api/v1/admin/skills/:name — enable or disable for chat/agent.
func (h *PlatformAdminHandler) PatchAdminSkill(c *gin.Context) {
	ctx := c.Request.Context()
	name, err := adminSkillNameFromParam(c)
	if err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	var body patchAdminSkillBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	if err := h.SkillSvc.SetSkillEnabled(ctx, name, body.Enabled); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "ok"})
}
