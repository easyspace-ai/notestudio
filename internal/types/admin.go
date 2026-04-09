package types

import "time"

// Admin is a platform operator account (SaaS console). Separate from end-user User.
type Admin struct {
	ID           string    `json:"id" gorm:"type:varchar(36);primaryKey"`
	Email        string    `json:"email" gorm:"uniqueIndex;not null"`
	PasswordHash string    `json:"-" gorm:"not null;column:password_hash"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName maps to platform_admins.
func (Admin) TableName() string { return "platform_admins" }

// AdminContextKey is the gin context key for the authenticated platform admin.
const AdminContextKey = "platform_admin"
