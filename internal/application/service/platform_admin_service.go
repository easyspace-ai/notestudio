package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
)

const (
	defaultPlatformAdminEmail    = "admin@163.com"
	defaultPlatformAdminPassword = "admin123"
)

type platformAdminAuthService struct {
	repo interfaces.PlatformAdminRepository
}

// NewPlatformAdminAuthService constructs the SaaS platform admin auth service.
func NewPlatformAdminAuthService(repo interfaces.PlatformAdminRepository) interfaces.PlatformAdminAuthService {
	return &platformAdminAuthService{repo: repo}
}

func platformAdminEmail() string {
	if e := strings.TrimSpace(os.Getenv("PLATFORM_ADMIN_EMAIL")); e != "" {
		return e
	}
	return defaultPlatformAdminEmail
}

func platformAdminPassword() string {
	if p := os.Getenv("PLATFORM_ADMIN_PASSWORD"); p != "" {
		return p
	}
	return defaultPlatformAdminPassword
}

// EnsureDefaultAdmin creates the initial platform admin if the table is empty.
// If PLATFORM_ADMIN_PASSWORD_SYNC is 1 or true, updates the existing admin row for
// PLATFORM_ADMIN_EMAIL (default admin@163.com) to match PLATFORM_ADMIN_PASSWORD (default admin123).
func (s *platformAdminAuthService) EnsureDefaultAdmin(ctx context.Context) error {
	n, err := s.repo.Count(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		if passwordSyncEnabled() {
			if err := s.syncPasswordFromConfig(ctx); err != nil {
				return err
			}
			logger.Infof(ctx, "Platform admin password synced from config (PLATFORM_ADMIN_PASSWORD_SYNC)")
		}
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(platformAdminPassword()), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	a := &types.Admin{
		ID:           uuid.New().String(),
		Email:        strings.ToLower(platformAdminEmail()),
		PasswordHash: string(hash),
	}
	if err := s.repo.Create(ctx, a); err != nil {
		return err
	}
	logger.Infof(ctx, "Seeded default platform admin email=%s", a.Email)
	return nil
}

func passwordSyncEnabled() bool {
	v := strings.TrimSpace(os.Getenv("PLATFORM_ADMIN_PASSWORD_SYNC"))
	return v == "1" || strings.EqualFold(v, "true")
}

func (s *platformAdminAuthService) syncPasswordFromConfig(ctx context.Context) error {
	email := strings.ToLower(platformAdminEmail())
	a, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return err
	}
	if a == nil {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(platformAdminPassword()), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	a.PasswordHash = string(hash)
	return s.repo.Update(ctx, a)
}

// Login validates credentials and returns a JWT (no refresh; console re-login).
func (s *platformAdminAuthService) Login(ctx context.Context, email, password string) (string, *types.Admin, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return "", nil, errors.New("email and password are required")
	}
	a, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return "", nil, err
	}
	if a == nil {
		return "", nil, errors.New("invalid email or password")
	}
	if bcrypt.CompareHashAndPassword([]byte(a.PasswordHash), []byte(password)) != nil {
		return "", nil, errors.New("invalid email or password")
	}
	token, err := s.signAdminToken(a)
	if err != nil {
		return "", nil, err
	}
	return token, a, nil
}

func (s *platformAdminAuthService) signAdminToken(a *types.Admin) (string, error) {
	claims := jwt.MapClaims{
		"admin_id": a.ID,
		"email":    a.Email,
		"typ":      "platform_admin",
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
		"iat":      time.Now().Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString([]byte(getJwtSecret()))
}

// ValidateAdminToken parses and verifies a platform admin JWT and loads the admin row.
func (s *platformAdminAuthService) ValidateAdminToken(ctx context.Context, tokenString string) (*types.Admin, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(getJwtSecret()), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}
	if typ, _ := claims["typ"].(string); typ != "platform_admin" {
		return nil, errors.New("not an admin token")
	}
	id, _ := claims["admin_id"].(string)
	if id == "" {
		return nil, errors.New("missing admin_id")
	}
	a, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if a == nil {
		return nil, errors.New("admin not found")
	}
	return a, nil
}
