<template>
  <div class="platform-manage-page">
    <div class="page-head">
      <h1>Skills 管理</h1>
      <p class="hint">
        管理 <code>skills/preloaded</code> 与 <code>skills/pubic</code> 下的 SKILL：查看全文、编辑保存、开关是否在对话/Agent
        中可用。关闭的技能不会出现在用户侧技能列表，也不会参与 Agent 技能加载。
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
        table-layout="auto"
      >
        <template #enabled="{ row }">
          <t-switch
            :model-value="row.enabled"
            :label="['关', '开']"
            @update:model-value="(v: boolean) => onToggleEnabled(row, v)"
          />
        </template>
        <template #ops="{ row }">
          <t-button size="small" variant="outline" @click="openView(row)">查看</t-button>
          <t-button size="small" theme="primary" variant="outline" class="btn-edit" @click="openEdit(row)">
            编辑
          </t-button>
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
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  listAdminSkills,
  getAdminSkill,
  updateAdminSkillContent,
  patchAdminSkillEnabled,
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

function sandboxModeOk(): boolean {
  const v = (import.meta as any).env?.VITE_WEKNORA_SANDBOX_MODE as string | undefined
  if (typeof v === 'string' && v !== '') {
    return v !== 'disabled'
  }
  return true
}

const columns = [
  { colKey: 'name', title: '名称', width: 200 },
  { colKey: 'description', title: '描述', ellipsis: true },
  {
    colKey: 'source',
    title: '来源',
    width: 110,
    cell: (_h: unknown, { row }: { row: SkillAdminRow }) => (row.source === 'pubic' ? 'pubic' : 'preloaded'),
  },
  { colKey: 'enabled', title: '启用', width: 100 },
  { colKey: 'ops', title: '操作', width: 200 },
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
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
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

.btn-edit {
  margin-left: 8px;
}
</style>
