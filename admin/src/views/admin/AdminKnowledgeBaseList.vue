<template>
  <div class="admin-kb-page">
    <div class="page-head">
      <h1>全部知识库</h1>
      <p class="hint">跨租户只读列表（不含临时知识库）。</p>
    </div>
    <t-table
      :data="rows"
      :columns="columns"
      :loading="loading"
      row-key="id"
      stripe
      hover
      table-layout="auto"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { listAllKnowledgeBasesAdmin, type AdminKnowledgeBaseRow } from '@/api/platform-admin'

const loading = ref(true)
const rows = ref<AdminKnowledgeBaseRow[]>([])

const columns = computed(() => [
  { colKey: 'name', title: '名称', ellipsis: true },
  { colKey: 'tenant_id', title: '租户 ID', width: 100 },
  { colKey: 'type', title: '类型', width: 120 },
  { colKey: 'embedding_model_id', title: 'Embedding 模型', ellipsis: true },
  { colKey: 'summary_model_id', title: '摘要模型', ellipsis: true },
  { colKey: 'created_at', title: '创建时间', width: 180 },
])

onMounted(async () => {
  loading.value = true
  try {
    rows.value = await listAllKnowledgeBasesAdmin()
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped lang="less">
.admin-kb-page {
  flex: 1;
  min-width: 0;
  padding: 24px 32px;
  overflow: auto;
}

.page-head {
  margin-bottom: 20px;

  h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 8px;
  }

  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--td-text-color-secondary);
  }
}
</style>
