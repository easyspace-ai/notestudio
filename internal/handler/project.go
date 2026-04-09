package handler

import (
	stderrors "errors"
	"net/http"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	secutils "github.com/Tencent/WeKnora/internal/utils"
	"github.com/gin-gonic/gin"
	gormlib "gorm.io/gorm"
)

// ProjectHandler handles MetaNote project APIs.
type ProjectHandler struct {
	service interfaces.ProjectService
}

// NewProjectHandler creates a ProjectHandler.
func NewProjectHandler(service interfaces.ProjectService) *ProjectHandler {
	return &ProjectHandler{service: service}
}

type createProjectBody struct {
	Name        string `json:"name"        binding:"required"`
	Description string `json:"description"`
}

// CreateProject POST /projects
func (h *ProjectHandler) CreateProject(c *gin.Context) {
	ctx := c.Request.Context()
	var body createProjectBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	p, err := h.service.CreateProject(ctx, body.Name, body.Description)
	if err != nil {
		logger.ErrorWithFields(ctx, err, nil)
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "data": p})
}

// ListProjects GET /projects
func (h *ProjectHandler) ListProjects(c *gin.Context) {
	ctx := c.Request.Context()
	var pagination types.Pagination
	if err := c.ShouldBindQuery(&pagination); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	list, total, err := h.service.ListProjects(ctx, &pagination)
	if err != nil {
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      list,
		"total":     total,
		"page":      pagination.Page,
		"page_size": pagination.PageSize,
	})
}

// GetProject GET /projects/:id
func (h *ProjectHandler) GetProject(c *gin.Context) {
	ctx := c.Request.Context()
	id := secutils.SanitizeForLog(c.Param("id"))
	p, err := h.service.GetProject(ctx, id)
	if err != nil {
		if stderrors.Is(err, gormlib.ErrRecordNotFound) {
			c.Error(apperrors.NewNotFoundError("project not found"))
			return
		}
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": p})
}

// GetProjectByUUID GET /projects/by-uuid/:uuid
func (h *ProjectHandler) GetProjectByUUID(c *gin.Context) {
	ctx := c.Request.Context()
	uuid := secutils.SanitizeForLog(c.Param("uuid"))
	p, err := h.service.GetProjectByUUID(ctx, uuid)
	if err != nil {
		if stderrors.Is(err, gormlib.ErrRecordNotFound) {
			c.Error(apperrors.NewNotFoundError("project not found"))
			return
		}
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": p})
}

type patchProjectBody struct {
	Name string `json:"name" binding:"required"`
}

// UpdateProject PATCH /projects/:id
func (h *ProjectHandler) UpdateProject(c *gin.Context) {
	ctx := c.Request.Context()
	id := secutils.SanitizeForLog(c.Param("id"))
	var body patchProjectBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	p, err := h.service.UpdateProject(ctx, id, body.Name)
	if err != nil {
		if stderrors.Is(err, gormlib.ErrRecordNotFound) {
			c.Error(apperrors.NewNotFoundError("project not found"))
			return
		}
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": p})
}

// DeleteProject DELETE /projects/:id
func (h *ProjectHandler) DeleteProject(c *gin.Context) {
	ctx := c.Request.Context()
	id := secutils.SanitizeForLog(c.Param("id"))
	if err := h.service.DeleteProject(ctx, id); err != nil {
		if err.Error() == "project not found" || stderrors.Is(err, gormlib.ErrRecordNotFound) {
			c.Error(apperrors.NewNotFoundError("project not found"))
			return
		}
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}
