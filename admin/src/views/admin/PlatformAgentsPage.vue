<template>
  <div class="platform-manage-page">
    <div class="page-head">
      <h1>Agent 管理</h1>
      <p class="hint">按租户维护智能体；请在顶部「管理租户」中选择目标租户。</p>
    </div>
    <div class="page-body-scroll">
      <AgentList />
    </div>
  </div>
</template>

<script setup lang="ts">
import AgentList from '@/views/agent/AgentList.vue'
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
  display: flex;
  flex-direction: column;
}

.page-body-scroll :deep(.agent-list-container) {
  flex: 1;
  min-height: 480px;
}
</style>
