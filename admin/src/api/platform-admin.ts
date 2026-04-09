/**
 * SaaS 平台管理员 API（与终端用户 JWT 独立，使用 platform admin token）。
 */
import { del, get, patch, post, put } from '@/utils/request'
import type { ModelConfig } from '@/api/model'

export async function platformAdminLogin(email: string, password: string): Promise<{
  access_token: string
  admin: { id: string; email: string }
}> {
  const res = (await post('/api/v1/admin/auth/login', { email, password })) as {
    success?: boolean
    data?: { access_token: string; admin: { id: string; email: string } }
  }
  if (!res?.success || !res?.data?.access_token) {
    throw new Error('登录响应无效')
  }
  return res.data
}

export async function listPlatformModels(): Promise<ModelConfig[]> {
  const res = (await get('/api/v1/admin/models')) as { success?: boolean; data?: ModelConfig[] }
  return Array.isArray(res?.data) ? res.data : []
}

export async function updatePlatformModel(id: string, body: Partial<ModelConfig>): Promise<ModelConfig> {
  const res = (await put(`/api/v1/admin/models/${encodeURIComponent(id)}`, body)) as {
    success?: boolean
    data?: ModelConfig
  }
  if (!res?.data) {
    throw new Error('更新模型失败')
  }
  return res.data
}

export async function createPlatformModel(body: ModelConfig): Promise<ModelConfig> {
  const res = (await post('/api/v1/admin/models', body)) as {
    success?: boolean
    data?: ModelConfig
  }
  if (!res?.data) {
    throw new Error('创建平台模型失败')
  }
  return res.data
}

export async function deletePlatformModel(id: string): Promise<void> {
  const res = (await del(`/api/v1/admin/models/${encodeURIComponent(id)}`)) as {
    success?: boolean
  }
  if (!res?.success) {
    throw new Error('删除平台模型失败')
  }
}

export interface AdminKnowledgeBaseRow {
  id: string
  name: string
  description?: string
  tenant_id: number
  type?: string
  embedding_model_id?: string
  summary_model_id?: string
  created_at: string
  updated_at: string
}

export async function listAllKnowledgeBasesAdmin(): Promise<AdminKnowledgeBaseRow[]> {
  const res = (await get('/api/v1/admin/knowledge-bases')) as {
    success?: boolean
    data?: AdminKnowledgeBaseRow[]
  }
  return Array.isArray(res?.data) ? res.data : []
}

export interface AdminSessionRow {
  id: string
  tenant_id: number
  title: string
  project_id?: string
  updated_at: string
  created_at: string
}

/** Platform-managed skills (preloaded + skills/pubic), for admin console. */
export interface SkillAdminRow {
  name: string
  description: string
  source: string
  enabled: boolean
}

export interface SkillAdminDetail extends SkillAdminRow {
  content: string
  rel_path: string
}

export async function listAdminSkills(): Promise<SkillAdminRow[]> {
  const res = (await get('/api/v1/admin/skills')) as { success?: boolean; data?: SkillAdminRow[] }
  return Array.isArray(res?.data) ? res.data : []
}

export async function getAdminSkill(name: string): Promise<SkillAdminDetail> {
  const enc = encodeURIComponent(name)
  const res = (await get(`/api/v1/admin/skills/${enc}`)) as {
    success?: boolean
    data?: SkillAdminDetail
  }
  if (!res?.data) {
    throw new Error('技能不存在或无权访问')
  }
  return res.data
}

export async function updateAdminSkillContent(name: string, content: string): Promise<void> {
  const enc = encodeURIComponent(name)
  const res = (await put(`/api/v1/admin/skills/${enc}`, { content })) as { success?: boolean }
  if (!res?.success) {
    throw new Error('保存失败')
  }
}

export async function patchAdminSkillEnabled(name: string, enabled: boolean): Promise<void> {
  const enc = encodeURIComponent(name)
  const res = (await patch(`/api/v1/admin/skills/${enc}`, { enabled })) as { success?: boolean }
  if (!res?.success) {
    throw new Error('更新开关失败')
  }
}

export async function listAllSessionsAdmin(page = 1, pageSize = 50): Promise<{
  data: AdminSessionRow[]
  total: number
  page: number
  page_size: number
}> {
  const res = (await get(
    `/api/v1/admin/sessions?page=${page}&page_size=${pageSize}`
  )) as {
    success?: boolean
    data?: AdminSessionRow[]
    total?: number
    page?: number
    page_size?: number
  }
  return {
    data: Array.isArray(res?.data) ? res.data : [],
    total: res?.total ?? 0,
    page: res?.page ?? page,
    page_size: res?.page_size ?? pageSize,
  }
}
