<template>
  <div class="admin-menu">
    <div class="brand">
      <span class="brand-title">平台管理</span>
      <span class="brand-sub" v-if="authStore.platformAdmin?.email">{{ authStore.platformAdmin.email }}</span>
    </div>
    <nav class="nav">
      <RouterLink class="nav-item" to="/platform/knowledge-bases" active-class="active">
        <t-icon name="folder" /> 知识库
      </RouterLink>
      <RouterLink class="nav-item" to="/platform/sessions" active-class="active">
        <t-icon name="chat" /> 会话
      </RouterLink>
      <RouterLink class="nav-item" to="/platform/models" active-class="active">
        <t-icon name="control-platform" /> 全局模型
      </RouterLink>
      <RouterLink class="nav-item" to="/platform/manage/agents" active-class="active" @click.prevent="goPlatformAgents">
        <t-icon name="user" /> Agent
      </RouterLink>
      <RouterLink class="nav-item" to="/platform/manage/mcp" active-class="active">
        <t-icon name="server" /> MCP
      </RouterLink>
      <RouterLink class="nav-item" to="/platform/manage/skills" active-class="active">
        <t-icon name="lightbulb" /> Skills
      </RouterLink>
    </nav>
    <div class="footer">
      <t-button theme="default" variant="outline" block @click="onLogout">退出登录</t-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

function onLogout() {
  authStore.logout()
  router.replace('/login')
}

function goPlatformAgents() {
  router.push('/platform/manage/agents')
}
</script>

<style scoped lang="less">
.admin-menu {
  width: 220px;
  min-width: 220px;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
  padding: 16px 12px;
}

.brand {
  margin-bottom: 20px;
  padding: 8px 8px 12px;
}

.brand-title {
  display: block;
  font-weight: 600;
  font-size: 16px;
  color: var(--td-text-color-primary);
}

.brand-sub {
  display: block;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-top: 4px;
  word-break: break-all;
}

.nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--td-text-color-secondary);
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--td-bg-color-secondarycontainer);
    color: var(--td-text-color-primary);
  }

  &.active {
    background: var(--td-brand-color-light);
    color: var(--td-brand-color);
    font-weight: 500;
  }
}

.footer {
  padding-top: 12px;
  border-top: 1px solid var(--td-component-border);
}
</style>
