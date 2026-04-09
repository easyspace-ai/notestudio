<template>
  <div class="admin-models-page">
    <div class="page-head">
      <h1>全局模型配置</h1>
      <p class="hint">此处修改的是平台内置模型，对所有租户的知识库与对话生效。</p>
    </div>
    <div class="page-body">
      <ModelSettings />
    </div>
  </div>
</template>

<script setup lang="ts">
import ModelSettings from '@/views/settings/ModelSettings.vue'
</script>

<style scoped lang="less">
.admin-models-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 24px 32px;
}

.page-head {
  margin-bottom: 16px;

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

.page-body {
  flex: 1;
  min-height: 0;
}
</style>
