<template>
  <div class="admin-sessions-page">
    <div class="page-head">
      <h1>全部会话</h1>
      <p class="hint">跨租户会话列表（分页）。</p>
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
    <div class="pager-wrap">
      <t-pagination
        v-model="page"
        v-model:page-size="pageSize"
        :total="total"
        show-jumper
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { listAllSessionsAdmin, type AdminSessionRow } from '@/api/platform-admin'

const loading = ref(true)
const rows = ref<AdminSessionRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)

const columns = computed(() => [
  { colKey: 'title', title: '标题', ellipsis: true },
  { colKey: 'tenant_id', title: '租户 ID', width: 100 },
  { colKey: 'id', title: '会话 ID', ellipsis: true },
  { colKey: 'updated_at', title: '更新时间', width: 180 },
  { colKey: 'created_at', title: '创建时间', width: 180 },
])

async function load() {
  loading.value = true
  try {
    const res = await listAllSessionsAdmin(page.value, pageSize.value)
    rows.value = res.data
    total.value = res.total
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

watch([page, pageSize], load, { immediate: true })
</script>

<style scoped lang="less">
.admin-sessions-page {
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

.pager-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
