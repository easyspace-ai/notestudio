package session

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/workspace"
	"github.com/Tencent/WeKnora/internal/errors"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	secutils "github.com/Tencent/WeKnora/internal/utils"
	"github.com/gin-gonic/gin"
)

// GetWorkspaceFile serves a file from the agent session workspace (user-data, including workspace cwd, and acp-workspace).
// Query: path — virtual or relative path as used by read_file / write_file (e.g. ./report.html, /mnt/user-data/...).
//
// GET /api/v1/sessions/:id/workspace-file?path=...
func (h *Handler) GetWorkspaceFile(c *gin.Context) {
	ctx := c.Request.Context()
	sessionID := strings.TrimSpace(secutils.SanitizeForLog(c.Param("id")))
	qpath := strings.TrimSpace(c.Query("path"))
	if sessionID == "" || qpath == "" {
		c.Error(errors.NewBadRequestError("session id and query path are required"))
		return
	}
	if strings.Contains(qpath, "..") {
		c.Error(errors.NewBadRequestError("invalid path"))
		return
	}

	if _, err := h.sessionService.GetSession(ctx, sessionID); err != nil {
		if err == errors.ErrSessionNotFound {
			c.Error(errors.NewNotFoundError(err.Error()))
			return
		}
		logger.ErrorWithFields(ctx, err, nil)
		c.Error(errors.NewInternalServerError(err.Error()))
		return
	}

	tid := c.GetUint64(types.TenantIDContextKey.String())
	if tid == 0 {
		c.Error(errors.NewUnauthorizedError("tenant context missing"))
		return
	}

	wctx := workspace.WithTenantID(ctx, tid)
	wctx = workspace.WithSessionID(wctx, sessionID)
	resolved := filepath.Clean(workspace.ResolveFromContext(wctx, qpath))

	root := workspace.DefaultRoot()
	if !sessionWorkspaceFileAllowed(root, tid, sessionID, resolved) {
		logger.Warnf(ctx, "workspace-file denied: session=%s resolved=%q", sessionID, resolved)
		c.Error(errors.NewForbiddenError("path not allowed"))
		return
	}

	f, err := os.Open(resolved)
	if err != nil {
		if os.IsNotExist(err) {
			c.Error(errors.NewNotFoundError("file not found"))
			return
		}
		logger.Warnf(ctx, "workspace-file open: %v", err)
		c.Error(errors.NewInternalServerError("failed to read file"))
		return
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil || st.IsDir() {
		c.Error(errors.NewBadRequestError("not a regular file"))
		return
	}

	ext := strings.ToLower(filepath.Ext(resolved))
	contentType := "application/octet-stream"
	switch ext {
	case ".html", ".htm":
		contentType = "text/html; charset=utf-8"
	case ".md", ".markdown":
		contentType = "text/markdown; charset=utf-8"
	case ".css":
		contentType = "text/css; charset=utf-8"
	case ".js", ".mjs":
		contentType = "text/javascript; charset=utf-8"
	case ".json":
		contentType = "application/json; charset=utf-8"
	case ".svg":
		contentType = "image/svg+xml"
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".pdf":
		contentType = "application/pdf"
	case ".pptx":
		contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	}

	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "private, max-age=60")
	if c.Query("download") == "1" || c.Query("download") == "true" {
		base := filepath.Base(resolved)
		c.Header("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(base, `"`, ``)+`"`)
	}

	c.Status(http.StatusOK)
	if _, err := io.Copy(c.Writer, f); err != nil {
		logger.Warnf(ctx, "workspace-file copy: %v", err)
	}
}

func sessionWorkspaceFileAllowed(root string, tenantID uint64, sessionID, resolved string) bool {
	resolved = filepath.Clean(strings.TrimSpace(resolved))
	if resolved == "" {
		return false
	}
	ud := workspace.UserDataDir(root, tenantID, sessionID)
	acp := workspace.ACPDir(root, tenantID, sessionID)
	for _, base := range []string{ud, acp} {
		if base == "" {
			continue
		}
		if workspace.PathWithinRoot(base, resolved) {
			return true
		}
	}
	return false
}
