<template>
  <div class="platform-manage-page">
    <div class="page-head">
      <h1>Skills 管理</h1>
      <p class="hint">
        管理 <code>skills/preloaded</code> 与 <code>skills/pubic</code> 下的 SKILL：查看全文、编辑保存、开关是否在对话/Agent
        中可用。关闭的技能不会出现在用户侧技能列表，也不会参与 Agent 技能加载。可通过「魔棒」配置展示名、默认标题、图标、Studio
        类型及是否在侧栏/魔棒显示（写入 <code>data/skill_studio_overrides.json</code>，并刷新快捷清单）。
      </p>
    </div>
    <div class="toolbar">
      <t-button theme="primary" variant="outline" :loading="loading" @click="loadList">刷新</t-button>
    </div>
    <div class="page-body">
      <t-alert v-if="!skillsRuntimeAvailable" theme="warning" class="mb">
        当前未启用 Skills 沙箱（WEKNORA_SANDBOX_MODE 非 docker/local），运行时 Agent 仍可能无法执行脚本类技能；列表与编辑仍可用。
      </t-alert>
      <t-table
        row-key="name"
        :data="rows"
        :columns="columns"
        :loading="loading"
        stripe
        table-layout="fixed"
        class="skills-admin-table"
      >
        <template #description="{ row }">
          <span class="skills-desc-cell" :title="row.description">{{ row.description || '—' }}</span>
        </template>
        <template #enabled="{ row }">
          <t-switch
            :model-value="row.enabled"
            :label="['关', '开']"
            @update:model-value="(v: boolean) => onToggleEnabled(row, v)"
          />
        </template>
        <template #ops="{ row }">
          <div class="ops-row">
            <t-button size="small" variant="outline" @click="openView(row)">查看</t-button>
            <t-button size="small" theme="primary" variant="outline" @click="openEdit(row)">编辑</t-button>
            <t-button size="small" variant="outline" @click="openStudioUi(row)">魔棒</t-button>
          </div>
        </template>
      </t-table>
    </div>
  </div>

  <t-dialog v-model:visible="viewVisible" :header="`查看 — ${activeName}`" width="900px" :footer="false">
    <div v-if="viewDetail" class="dialog-meta">
      <span>来源：{{ viewDetail.source }}</span>
      <span class="sep">|</span>
      <span>{{ viewDetail.rel_path }}</span>
    </div>
    <t-textarea
      v-if="viewDetail"
      :model-value="viewDetail.content"
      readonly
      class="mono-area"
      :autosize="{ minRows: 18, maxRows: 28 }"
    />
  </t-dialog>

  <t-dialog
    v-model:visible="editVisible"
    :header="`编辑 — ${activeName}`"
    width="900px"
    :confirm-btn="{ content: '保存', loading: saving }"
    @confirm="saveEdit"
  >
    <p class="edit-hint">须符合 SKILL.md 规范：YAML frontmatter（name / description）与正文；保存前会校验。</p>
    <t-textarea v-model="editContent" class="mono-area" :autosize="{ minRows: 18, maxRows: 28 }" />
  </t-dialog>

  <t-dialog
    v-model:visible="studioVisible"
    :header="`魔棒 / Studio — ${activeName}`"
    width="560px"
    :confirm-btn="{ content: '保存', loading: studioSaving }"
    @confirm="saveStudioUi"
  >
    <p class="studio-hint">
      覆盖用户侧「魔棒」与右侧 Studio 快贴的展示信息；不填的文本项表示不覆盖扫描推断。技能正文仍在「编辑」里改
      SKILL.md。
    </p>
    <div class="studio-form">
      <div class="field">
        <span class="label">展示名（别名）</span>
        <t-input v-model="studioForm.display_label" placeholder="留空则不覆盖" clearable />
      </div>
      <div class="field">
        <span class="label">默认任务标题</span>
        <t-input v-model="studioForm.default_title" placeholder="创建 Studio 任务时的默认标题" clearable />
      </div>
      <div class="field">
        <span class="label">图标</span>
        <t-select v-model="studioForm.icon" :options="iconOptions" placeholder="选择或留空" clearable />
      </div>
      <div class="field">
        <span class="label">Studio 类型 (studio_kind)</span>
        <t-select v-model="studioForm.studio_kind" :options="studioKindOptions" placeholder="留空则不覆盖" clearable />
      </div>
      <div class="field field-row">
        <span class="label">在魔棒 / Studio 中显示</span>
        <t-switch v-model="studioForm.show_in_studio_ui" />
      </div>
    </div>
    <div class="studio-footer-actions">
      <t-button theme="danger" variant="outline" size="small" :loading="studioClearing" @click="clearStudioUiOverrides">
        清除覆盖
      </t-button>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { getApiErrorMessage } from '@/utils/apiError'
import {
  listAdminSkills,
  getAdminSkill,
  updateAdminSkillContent,
  patchAdminSkillEnabled,
  putAdminSkillStudioUI,
  deleteAdminSkillStudioUI,
  type SkillAdminRow,
  type SkillAdminDetail,
} from '@/api/platform-admin'

const loading = ref(true)
const saving = ref(false)
const rows = ref<SkillAdminRow[]>([])
const skillsRuntimeAvailable = ref(true)

const viewVisible = ref(false)
const editVisible = ref(false)
const viewDetail = ref<SkillAdminDetail | null>(null)
const editContent = ref('')
const activeName = ref('')

const studioVisible = ref(false)
const studioSaving = ref(false)
const studioClearing = ref(false)
const studioForm = ref({
  display_label: '',
  default_title: '',
  icon: '',
  studio_kind: '',
  show_in_studio_ui: true,
})

const iconOptions = [
  { label: '（不覆盖）', value: '' },
  { label: 'presentation 幻灯片', value: 'presentation' },
  { label: 'file-code 网页', value: 'file-code' },
  { label: 'mic 音频', value: 'mic' },
  { label: 'brain 导图', value: 'brain' },
  { label: 'sparkles 默认', value: 'sparkles' },
]

const studioKindOptions = [
  { label: '（不覆盖）', value: '' },
  { label: 'html', value: 'html' },
  { label: 'slides', value: 'slides' },
  { label: 'audio', value: 'audio' },
  { label: 'mindmap', value: 'mindmap' },
]

function sandboxModeOk(): boolean {
  const v = (import.meta as any).env?.VITE_WEKNORA_SANDBOX_MODE as string | undefined
  if (typeof v === 'string' && v !== '') {
    return v !== 'disabled'
  }
  return true
}

const columns = [
  { colKey: 'name', title: '名称', width: 200, ellipsis: true },
  /** 展示由 #description 插槽做 2 行截断，避免长描述撑高整行 */
  { colKey: 'description', title: '描述', minWidth: 120 },
  {
    colKey: 'source',
    title: '来源',
    width: 110,
    cell: (_h: unknown, { row }: { row: SkillAdminRow }) => (row.source === 'pubic' ? 'pubic' : 'preloaded'),
  },
  { colKey: 'enabled', title: '启用', width: 100 },
  {
    colKey: 'studio_hint',
    title: '魔棒配置',
    width: 96,
    cell: (_h: unknown, { row }: { row: SkillAdminRow }) => (row.studio_ui ? '已覆盖' : '—'),
  },
  { colKey: 'ops', title: '操作', width: 280 },
]

async function loadList() {
  loading.value = true
  try {
    rows.value = await listAdminSkills()
    skillsRuntimeAvailable.value = sandboxModeOk()
  } catch (e: unknown) {
    MessagePlugin.error(e instanceof Error ? e.message : '加载失败')
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function onToggleEnabled(row: SkillAdminRow, enabled: boolean) {
  try {
    await patchAdminSkillEnabled(row.name, enabled)
    row.enabled = enabled
    MessagePlugin.success(enabled ? '已开启' : '已关闭')
  } catch (e: unknown) {
    MessagePlugin.error(e instanceof Error ? e.message : '更新失败')
    await loadList()
  }
}

async function openView(row: SkillAdminRow) {
  activeName.value = row.name
  try {
    viewDetail.value = await getAdminSkill(row.name)
    viewVisible.value = true
  } catch (e: unknown) {
    MessagePlugin.error(e instanceof Error ? e.message : '加载详情失败')
  }
}

async function openEdit(row: SkillAdminRow) {
  activeName.value = row.name
  try {
    const d = await getAdminSkill(row.name)
    editContent.value = d.content
    editVisible.value = true
  } catch (e: unknown) {
    MessagePlugin.error(e instanceof Error ? e.message : '加载详情失败')
  }
}

async function saveEdit() {
  if (!activeName.value) return
  saving.value = true
  try {
    await updateAdminSkillContent(activeName.value, editContent.value)
    MessagePlugin.success('已保存')
    editVisible.value = false
    await loadList()
  } catch (e: unknown) {
    MessagePlugin.error(getApiErrorMessage(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

function openStudioUi(row: SkillAdminRow) {
  activeName.value = row.name
  const u = row.studio_ui
  studioForm.value = {
    display_label: u?.display_label ?? '',
    default_title: u?.default_title ?? '',
    icon: u?.icon ?? '',
    studio_kind: u?.studio_kind ?? '',
    show_in_studio_ui: u?.show_in_studio_ui !== false,
  }
  studioVisible.value = true
}

async function saveStudioUi() {
  if (!activeName.value) return
  studioSaving.value = true
  try {
    const f = studioForm.value
    await putAdminSkillStudioUI(activeName.value, {
      display_label: f.display_label.trim(),
      default_title: f.default_title.trim(),
      icon: f.icon.trim(),
      studio_kind: f.studio_kind.trim(),
      show_in_studio_ui: f.show_in_studio_ui,
    })
    MessagePlugin.success('已保存')
    studioVisible.value = false
    await loadList()
  } catch (e: unknown) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    studioSaving.value = false
  }
}

async function clearStudioUiOverrides() {
  if (!activeName.value) return
  if (!window.confirm(`确定清除技能「${activeName.value}」的魔棒/Studio 展示覆盖？`)) {
    return
  }
  studioClearing.value = true
  try {
    await deleteAdminSkillStudioUI(activeName.value)
    MessagePlugin.success('已清除')
    studioVisible.value = false
    await loadList()
  } catch (e: unknown) {
    MessagePlugin.error(getApiErrorMessage(e, '清除失败'))
  } finally {
    studioClearing.value = false
  }
}

onMounted(loadList)
</script>

<style scoped lang="less">
.platform-manage-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 24px 32px;
}

.page-head {
  margin-bottom: 8px;

  h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 8px;
  }

  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--td-text-color-secondary);
    line-height: 1.5;
    code {
      font-size: 12px;
    }
  }
}

.toolbar {
  margin-bottom: 12px;
}

.page-body {
  flex: 1;
  min-height: 0;
}

/* 描述限高，避免长文案把单行撑得过高；悬停 title 可看全文 */
.skills-admin-table {
  :deep(.t-table__content) {
    overflow-x: auto;
  }
}

.skills-desc-cell {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  line-height: 1.35;
  max-height: 2.75em;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.mb {
  margin-bottom: 12px;
}

.dialog-meta {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
  .sep {
    margin: 0 8px;
    opacity: 0.5;
  }
}

.mono-area {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.edit-hint {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin: 0 0 8px;
}

.ops-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.studio-hint {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.5;
  margin: 0 0 12px;
}

.studio-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.studio-form .field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.studio-form .field-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.studio-form .label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.studio-footer-actions {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--td-component-border);
}
</style>
