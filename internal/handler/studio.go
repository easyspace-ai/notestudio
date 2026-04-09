package handler

import (
	"errors"
	"net/http"

	apperrors "github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	secutils "github.com/Tencent/WeKnora/internal/utils"
	"github.com/gin-gonic/gin"
	gormlib "gorm.io/gorm"
)

// StudioHandler handles MetaNote Studio async jobs API.
type StudioHandler struct {
	service interfaces.StudioService
}

// NewStudioHandler creates a StudioHandler.
func NewStudioHandler(service interfaces.StudioService) *StudioHandler {
	return &StudioHandler{service: service}
}

type createStudioJobBody struct {
	Kind         string  `json:"kind"          binding:"required"`
	Title        string  `json:"title"         binding:"required"`
	ProjectUUID  string  `json:"project_uuid"  binding:"required"`
	SessionID    *string `json:"session_id,omitempty"`
}

// CreateJob POST /studio/jobs — returns 202 Accepted with job payload.
func (h *StudioHandler) CreateJob(c *gin.Context) {
	ctx := c.Request.Context()
	var body createStudioJobBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	body.ProjectUUID = secutils.SanitizeForLog(body.ProjectUUID)
	job, err := h.service.CreateJob(ctx, body.ProjectUUID, body.Kind, body.Title, body.SessionID)
	if err != nil {
		logger.ErrorWithFields(ctx, err, nil)
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": job})
}

// ListJobs GET /studio/jobs?project_uuid=&page=&page_size=
func (h *StudioHandler) ListJobs(c *gin.Context) {
	ctx := c.Request.Context()
	projectUUID := secutils.SanitizeForLog(c.Query("project_uuid"))
	if projectUUID == "" {
		c.Error(apperrors.NewBadRequestError("project_uuid is required"))
		return
	}
	var pagination types.Pagination
	if err := c.ShouldBindQuery(&pagination); err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	list, total, err := h.service.ListJobs(ctx, projectUUID, &pagination)
	if err != nil {
		c.Error(apperrors.NewBadRequestError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"data":      list,
		"total":     total,
		"page":      pagination.GetPage(),
		"page_size": pagination.GetPageSize(),
	})
}

// GetJob GET /studio/jobs/:id
func (h *StudioHandler) GetJob(c *gin.Context) {
	ctx := c.Request.Context()
	id := secutils.SanitizeForLog(c.Param("id"))
	job, err := h.service.GetJob(ctx, id)
	if err != nil {
		if errors.Is(err, gormlib.ErrRecordNotFound) {
			c.Error(apperrors.NewNotFoundError("job not found"))
			return
		}
		c.Error(apperrors.NewInternalServerError(err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": job})
}
