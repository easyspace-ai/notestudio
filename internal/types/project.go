package types

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Project is a MetaNote workspace: one knowledge base per project; uuid is used in URLs.
type Project struct {
	ID               string         `json:"id"                 gorm:"type:varchar(36);primaryKey"`
	UUID             string         `json:"uuid"               gorm:"type:varchar(36);uniqueIndex;not null"`
	TenantID         uint64         `json:"tenant_id"          gorm:"index;not null"`
	Name             string         `json:"name"`
	KnowledgeBaseID  string         `json:"knowledge_base_id"  gorm:"type:varchar(36);uniqueIndex;not null"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `json:"deleted_at"         gorm:"index"`
}

// BeforeCreate sets primary key and public uuid.
func (p *Project) BeforeCreate(tx *gorm.DB) error {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	if p.UUID == "" {
		p.UUID = uuid.New().String()
	}
	return nil
}
