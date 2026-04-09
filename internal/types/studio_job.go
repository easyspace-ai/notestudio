package types

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Studio job lifecycle (persisted in studio_jobs.status).
const (
	StudioJobStatusPending   = "pending"
	StudioJobStatusRunning   = "running"
	StudioJobStatusSucceeded = "succeeded"
	StudioJobStatusFailed    = "failed"
)

// Studio artifact kinds (MVP: html fully implemented; others may fail fast until extended).
const (
	StudioKindHTML    = "html"
	StudioKindSlides  = "slides"
	StudioKindAudio   = "audio"
	StudioKindMindmap = "mindmap"
)

// StudioJob stores one async Studio generation job and its artifact reference(s).
type StudioJob struct {
	ID            string         `json:"id"              gorm:"type:varchar(36);primaryKey"`
	TenantID      uint64         `json:"tenant_id"       gorm:"index;not null"`
	ProjectID     string         `json:"project_id"      gorm:"type:varchar(36);index;not null"`
	Kind          string         `json:"kind"            gorm:"type:varchar(32);not null"`
	Title         string         `json:"title"           gorm:"type:varchar(512);not null"`
	Status        string         `json:"status"          gorm:"type:varchar(32);not null"`
	ErrorMessage  string         `json:"error_message,omitempty"`
	SessionID     *string        `json:"session_id,omitempty" gorm:"type:varchar(36)"`
	ArtifactPath  string         `json:"artifact_path,omitempty"`
	Artifacts     JSON           `json:"artifacts,omitempty"  gorm:"type:jsonb"` // extra metadata / multi-file
	Input         JSON           `json:"input,omitempty"      gorm:"type:jsonb"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"deleted_at,omitempty" gorm:"index"`
}

// BeforeCreate sets primary key.
func (j *StudioJob) BeforeCreate(tx *gorm.DB) error {
	if j.ID == "" {
		j.ID = uuid.New().String()
	}
	return nil
}
