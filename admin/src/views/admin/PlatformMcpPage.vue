<template>
  <div class="platform-manage-page">
    <div class="page-head">
      <h1>MCP 服务</h1>
      <p class="hint">按租户配置 MCP；请在顶部「管理租户」中选择目标租户。</p>
    </div>
    <div class="page-body-scroll">
      <McpSettings />
    </div>
  </div>
</template>

<script setup lang="ts">
import McpSettings from '@/views/settings/McpSettings.vue'
</script>

<style scoped lang="less">
.platform-manage-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 24px 32px;
  overflow: hidden;
}

.page-head {
  flex-shrink: 0;
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
  }
}

.page-body-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
