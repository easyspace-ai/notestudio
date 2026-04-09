<template>
  <div class="platform-tenant-bar">
    <span class="label">管理租户</span>
    <t-select
      v-model="tenantId"
      class="tenant-select"
      :options="options"
      :loading="loading"
      placeholder="选择租户（设置、Agent、模型、知识库、网络搜索等）"
      filterable
      @change="onChange"
    />
    <span class="hint">平台端接口需带 X-Tenant-ID；请在此选择要代管的租户（未选时部分保存操作会失败）。</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listAllKnowledgeBasesAdmin } from '@/api/platform-admin'

const STORAGE_KEY = 'weknora_platform_manage_tenant_id'

const tenantId = ref<string>(localStorage.getItem(STORAGE_KEY) || '')
const options = ref<{ label: string; value: string }[]>([])
const loading = ref(true)

function persist() {
  if (tenantId.value) {
    localStorage.setItem(STORAGE_KEY, tenantId.value)
  }
}

function onChange() {
  persist()
}

onMounted(async () => {
  try {
    const kbs = await listAllKnowledgeBasesAdmin()
    const set = new Set<number>()
    for (const k of kbs) {
      if (k.tenant_id != null) set.add(Number(k.tenant_id))
    }
    const ids = [...set].sort((a, b) => a - b)
    options.value = ids.map((id) => ({ label: `租户 ${id}`, value: String(id) }))
    const valid = ids.map(String).includes(tenantId.value)
    if ((!tenantId.value || !valid) && ids.length > 0) {
      tenantId.value = String(ids[0]!)
      persist()
    }
  } catch (e) {
    console.error('load tenants for platform bar', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="less">
.platform-tenant-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
  border-radius: 8px;
  border: 1px solid var(--td-component-border);
  background: var(--td-bg-color-secondarycontainer);
}

.label {
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.tenant-select {
  min-width: 200px;
  max-width: 320px;
}

.hint {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  flex: 1 1 100%;
}
</style>
