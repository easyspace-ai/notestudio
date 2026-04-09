package middleware

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/Tencent/WeKnora/internal/config"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/gin-gonic/gin"
)

// 无需认证的API列表
var noAuthAPI = map[string][]string{
	"/health":                    {"GET"},
	"/api/v1/auth/register":      {"POST"},
	"/api/v1/auth/login":         {"POST"},
	"/api/v1/auth/oidc/config":   {"GET"},
	"/api/v1/auth/oidc/url":      {"GET"},
	"/api/v1/auth/oidc/callback": {"GET"},
	"/api/v1/auth/refresh":       {"POST"},
	"/api/v1/admin/auth/login":   {"POST"},
}

// normalizeAuthPath trims trailing slash and lowercases so /api/v1/Admin/... and /api/.../login/ match.
func normalizeAuthPath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.TrimSuffix(p, "/")
	p = strings.ToLower(p)
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		return "/" + p
	}
	return p
}

// incomingRequestPath returns the request path; some proxies leave URL.Path empty but set RequestURI.
func incomingRequestPath(c *gin.Context) string {
	p := strings.TrimSpace(c.Request.URL.Path)
	if p != "" {
		return p
	}
	ru := strings.TrimSpace(c.Request.RequestURI)
	if ru == "" {
		return ""
	}
	if i := strings.IndexByte(ru, '?'); i >= 0 {
		ru = ru[:i]
	}
	return ru
}

// 检查请求是否在无需认证的API列表中
func isNoAuthAPI(path string, method string) bool {
	path = normalizeAuthPath(path)
	method = strings.ToUpper(strings.TrimSpace(method))
	for api, methods := range noAuthAPI {
		// 如果以*结尾，按照前缀匹配，否则按照全路径匹配
		if strings.HasSuffix(api, "*") {
			prefix := normalizeAuthPath(strings.TrimSuffix(api, "*"))
			if strings.HasPrefix(path, prefix) && slices.Contains(methods, method) {
				return true
			}
		} else if path == normalizeAuthPath(api) && slices.Contains(methods, method) { // methods entries are uppercase POST, GET, ...
			return true
		}
	}
	return false
}

// platformAdminTenantProxyPath lists tenant-scoped APIs the platform admin may call with Bearer admin JWT + X-Tenant-ID.
// Must stay in sync with admin/src/utils/request.ts shouldUsePlatformTenantProxy (except Ollama-only paths).
func platformAdminTenantProxyPath(p string) bool {
	p = normalizeAuthPath(p)
	prefixes := []string{
		"/api/v1/agents",
		"/api/v1/mcp-services",
		"/api/v1/skills",
		"/api/v1/models",
		"/api/v1/knowledge-bases",
		"/api/v1/shared-knowledge-bases",
		"/api/v1/shared-agents",
		"/api/v1/organizations",
		"/api/v1/tenants/kv/",
		"/api/v1/web-search-providers",
		"/api/v1/system/storage-engine-status",
		"/api/v1/auth/me",
		"/api/v1/auth/tenant",
	}
	for _, pre := range prefixes {
		if strings.HasPrefix(p, pre) {
			return true
		}
	}
	return false
}

// platformAdminJWTOnlyNoTenantPath: valid admin JWT is enough (no X-Tenant-ID). Handled by tryPlatformAdminJWTOnlyAuth.
func platformAdminJWTOnlyNoTenantPath(p string, method string) bool {
	p = normalizeAuthPath(p)
	m := strings.ToUpper(strings.TrimSpace(method))
	switch m {
	case http.MethodGet:
		if strings.HasPrefix(p, "/api/v1/system/info") {
			return true
		}
		if strings.HasPrefix(p, "/api/v1/system/parser-engines") && !strings.HasPrefix(p, "/api/v1/system/parser-engines/check") {
			return true
		}
	case http.MethodPost:
		if strings.HasPrefix(p, "/api/v1/system/parser-engines/check") {
			return true
		}
		if strings.HasPrefix(p, "/api/v1/system/docreader/reconnect") {
			return true
		}
	}
	return false
}

// tryPlatformAdminTenantAuth validates a platform admin JWT and injects tenant + synthetic user so handlers reuse tenant APIs.
func tryPlatformAdminTenantAuth(
	c *gin.Context,
	token string,
	adminAuth interfaces.PlatformAdminAuthService,
	tenantService interfaces.TenantService,
) bool {
	adm, err := adminAuth.ValidateAdminToken(c.Request.Context(), token)
	if err != nil || adm == nil {
		return false
	}
	p := normalizeAuthPath(incomingRequestPath(c))
	if platformAdminJWTOnlyNoTenantPath(p, c.Request.Method) {
		return false
	}
	if !platformAdminTenantProxyPath(p) {
		return false
	}
	tidStr := strings.TrimSpace(c.GetHeader("X-Tenant-ID"))
	if tidStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header required for platform admin tenant API access"})
		c.Abort()
		return true
	}
	tid, err := strconv.ParseUint(tidStr, 10, 64)
	if err != nil || tid == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid X-Tenant-ID"})
		c.Abort()
		return true
	}
	tenant, err := tenantService.GetTenantByID(c.Request.Context(), tid)
	if err != nil || tenant == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tenant not found"})
		c.Abort()
		return true
	}
	// Reuse admin row UUID as synthetic user id (distinct table from users).
	u := &types.User{
		ID:                  adm.ID,
		Username:            "platform-admin",
		Email:               adm.Email,
		TenantID:            tid,
		IsActive:            true,
		CanAccessAllTenants: true,
	}
	c.Set(types.AdminContextKey, adm)
	c.Set(types.TenantIDContextKey.String(), tid)
	c.Set(types.TenantInfoContextKey.String(), tenant)
	c.Set(types.UserContextKey.String(), u)
	c.Set(types.UserIDContextKey.String(), u.ID)
	c.Request = c.Request.WithContext(
		context.WithValue(
			context.WithValue(
				context.WithValue(
					context.WithValue(c.Request.Context(), types.TenantIDContextKey, tid),
					types.TenantInfoContextKey, tenant,
				),
				types.UserContextKey, u,
			),
			types.UserIDContextKey, u.ID,
		),
	)
	c.Next()
	return true
}

func tryPlatformAdminJWTOnlyAuth(
	c *gin.Context,
	token string,
	adminAuth interfaces.PlatformAdminAuthService,
) bool {
	p := normalizeAuthPath(incomingRequestPath(c))
	if !platformAdminJWTOnlyNoTenantPath(p, c.Request.Method) {
		return false
	}
	adm, err := adminAuth.ValidateAdminToken(c.Request.Context(), token)
	if err != nil || adm == nil {
		return false
	}
	c.Set(types.AdminContextKey, adm)
	u := &types.User{
		ID:                  adm.ID,
		Username:            "platform-admin",
		Email:               adm.Email,
		TenantID:            0,
		IsActive:            true,
		CanAccessAllTenants: true,
	}
	c.Set(types.UserContextKey.String(), u)
	c.Set(types.UserIDContextKey.String(), u.ID)
	ctx := context.WithValue(
		context.WithValue(c.Request.Context(), types.UserContextKey, u),
		types.UserIDContextKey, u.ID,
	)
	c.Request = c.Request.WithContext(ctx)
	c.Next()
	return true
}

// platformAdminOllamaInitPath matches Ollama 检测/列表/下载等接口：不依赖租户上下文，
// 平台管理员仅持有 admin JWT、未选「管理租户」时也应能打开 Ollama 设置页。
func platformAdminOllamaInitPath(p string) bool {
	return strings.HasPrefix(p, "/api/v1/initialization/ollama")
}

func tryPlatformAdminOllamaInitAuth(
	c *gin.Context,
	token string,
	adminAuth interfaces.PlatformAdminAuthService,
) bool {
	adm, err := adminAuth.ValidateAdminToken(c.Request.Context(), token)
	if err != nil || adm == nil {
		return false
	}
	p := normalizeAuthPath(incomingRequestPath(c))
	if !platformAdminOllamaInitPath(p) {
		return false
	}
	c.Set(types.AdminContextKey, adm)
	u := &types.User{
		ID:                  adm.ID,
		Username:            "platform-admin",
		Email:               adm.Email,
		TenantID:            0,
		IsActive:            true,
		CanAccessAllTenants: true,
	}
	c.Set(types.UserContextKey.String(), u)
	c.Set(types.UserIDContextKey.String(), u.ID)
	ctx := context.WithValue(
		context.WithValue(c.Request.Context(), types.UserContextKey, u),
		types.UserIDContextKey, u.ID,
	)
	c.Request = c.Request.WithContext(ctx)
	c.Next()
	return true
}

// canAccessTenant checks if a user can access a target tenant
func canAccessTenant(user *types.User, targetTenantID uint64, cfg *config.Config) bool {
	// 1. 检查功能是否启用
	if cfg == nil || cfg.Tenant == nil || !cfg.Tenant.EnableCrossTenantAccess {
		return false
	}
	// 2. 检查用户权限
	if !user.CanAccessAllTenants {
		return false
	}
	// 3. 如果目标租户是用户自己的租户，允许访问
	if user.TenantID == targetTenantID {
		return true
	}
	// 4. 用户有跨租户权限，允许访问（具体验证在中间件中完成）
	return true
}

// Auth 认证中间件
func Auth(
	tenantService interfaces.TenantService,
	userService interfaces.UserService,
	cfg *config.Config,
	adminAuth interfaces.PlatformAdminAuthService,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ignore OPTIONS request
		if c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		reqPath := normalizeAuthPath(incomingRequestPath(c))
		// 平台管理员登录必须匿名：放在最前，避免仅靠 noAuth 映射或 URL.Path 异常时误拦（表现为 401 missing authentication）
		if reqPath == "/api/v1/admin/auth/login" && strings.EqualFold(c.Request.Method, http.MethodPost) {
			c.Next()
			return
		}

		// 检查请求是否在无需认证的API列表中
		if isNoAuthAPI(incomingRequestPath(c), c.Request.Method) {
			c.Next()
			return
		}

		// SaaS platform admin API (separate JWT; not end-user)
		adminPath := reqPath
		if strings.HasPrefix(adminPath, "/api/v1/admin/") {
			// 登录必须无 Bearer；避免仅靠 noAuthAPI 精确匹配失败时误走下方校验
			if adminPath == "/api/v1/admin/auth/login" && c.Request.Method == http.MethodPost {
				c.Next()
				return
			}
			authHeader := c.GetHeader("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: admin Bearer token required"})
				c.Abort()
				return
			}
			token := strings.TrimPrefix(authHeader, "Bearer ")
			adm, err := adminAuth.ValidateAdminToken(c.Request.Context(), token)
			if err != nil || adm == nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: invalid admin token"})
				c.Abort()
				return
			}
			c.Set(types.AdminContextKey, adm)
			c.Next()
			return
		}

		// 尝试JWT Token认证
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			user, err := userService.ValidateToken(c.Request.Context(), token)
			if err == nil && user != nil {
				// JWT Token认证成功
				// 检查是否有跨租户访问请求
				targetTenantID := user.TenantID
				tenantHeader := c.GetHeader("X-Tenant-ID")
				if tenantHeader != "" {
					// 解析目标租户ID
					parsedTenantID, err := strconv.ParseUint(tenantHeader, 10, 64)
					if err == nil {
						// 检查用户是否有跨租户访问权限
						if canAccessTenant(user, parsedTenantID, cfg) {
							// 验证目标租户是否存在
							targetTenant, err := tenantService.GetTenantByID(c.Request.Context(), parsedTenantID)
							if err == nil && targetTenant != nil {
								targetTenantID = parsedTenantID
								log.Printf("User %s switching to tenant %d", user.ID, targetTenantID)
							} else {
								log.Printf("Error getting target tenant by ID: %v, tenantID: %d", err, parsedTenantID)
								c.JSON(http.StatusBadRequest, gin.H{
									"error": "Invalid target tenant ID",
								})
								c.Abort()
								return
							}
						} else {
							// 用户没有权限访问目标租户
							log.Printf("User %s attempted to access tenant %d without permission", user.ID, parsedTenantID)
							c.JSON(http.StatusForbidden, gin.H{
								"error": "Forbidden: insufficient permissions to access target tenant",
							})
							c.Abort()
							return
						}
					}
				}

				// 获取租户信息（使用目标租户ID）
				tenant, err := tenantService.GetTenantByID(c.Request.Context(), targetTenantID)
				if err != nil {
					log.Printf("Error getting tenant by ID: %v, tenantID: %d, userID: %s", err, targetTenantID, user.ID)
					c.JSON(http.StatusUnauthorized, gin.H{
						"error": "Unauthorized: invalid tenant",
					})
					c.Abort()
					return
				}

				// 存储用户和租户信息到上下文
				c.Set(types.TenantIDContextKey.String(), targetTenantID)
				c.Set(types.TenantInfoContextKey.String(), tenant)
				c.Set(types.UserContextKey.String(), user)
				c.Set(types.UserIDContextKey.String(), user.ID)
				c.Request = c.Request.WithContext(
					context.WithValue(
						context.WithValue(
							context.WithValue(
								context.WithValue(c.Request.Context(), types.TenantIDContextKey, targetTenantID),
								types.TenantInfoContextKey, tenant,
							),
							types.UserContextKey, user,
						),
						types.UserIDContextKey, user.ID,
					),
				)
				c.Next()
				return
			}
			if tryPlatformAdminTenantAuth(c, token, adminAuth, tenantService) {
				return
			}
			if tryPlatformAdminOllamaInitAuth(c, token, adminAuth) {
				return
			}
			if tryPlatformAdminJWTOnlyAuth(c, token, adminAuth) {
				return
			}
		}

		// 尝试X-API-Key认证（兼容模式）
		apiKey := c.GetHeader("X-API-Key")
		if apiKey != "" {
			// Get tenant information
			tenantID, err := tenantService.ExtractTenantIDFromAPIKey(apiKey)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Unauthorized: invalid API key format",
				})
				c.Abort()
				return
			}

			// Verify API key validity (matches the one in database)
			t, err := tenantService.GetTenantByID(c.Request.Context(), tenantID)
			if err != nil {
				log.Printf("Error getting tenant by ID: %v, tenantID: %d", err, tenantID)
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Unauthorized: invalid API key",
				})
				c.Abort()
				return
			}

			if t == nil || t.APIKey != apiKey {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Unauthorized: invalid API key",
				})
				c.Abort()
				return
			}

			// 存储租户和用户信息到上下文
			c.Set(types.TenantIDContextKey.String(), tenantID)
			c.Set(types.TenantInfoContextKey.String(), t)

			ctx := context.WithValue(
				context.WithValue(c.Request.Context(), types.TenantIDContextKey, tenantID),
				types.TenantInfoContextKey, t,
			)

			// 通过 TenantID 关联查询用户；找不到时构造系统虚拟用户，
			// 确保所有依赖 UserContextKey 的下游 handler 正常工作。
			user, err := userService.GetUserByTenantID(c.Request.Context(), tenantID)
			if err != nil || user == nil {
				user = &types.User{
					ID:       fmt.Sprintf("system-%d", tenantID),
					Username: fmt.Sprintf("system-%d", tenantID),
					Email:    fmt.Sprintf("system-%d@api-key.local", tenantID),
					TenantID: tenantID,
					IsActive: true,
				}
				log.Printf("No user found for tenant %d via API key, using synthetic system user %s", tenantID, user.ID)
			}
			c.Set(types.UserContextKey.String(), user)
			c.Set(types.UserIDContextKey.String(), user.ID)
			ctx = context.WithValue(
				context.WithValue(ctx, types.UserContextKey, user),
				types.UserIDContextKey, user.ID,
			)

			c.Request = c.Request.WithContext(ctx)
			c.Next()
			return
		}

		// 没有提供任何认证信息
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: missing authentication"})
		c.Abort()
	}
}

// GetTenantIDFromContext helper function to get tenant ID from context
func GetTenantIDFromContext(ctx context.Context) (uint64, error) {
	tenantID, ok := ctx.Value("tenantID").(uint64)
	if !ok {
		return 0, errors.New("tenant ID not found in context")
	}
	return tenantID, nil
}
