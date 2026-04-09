import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isPlatformConsole } from '@/composables/usePlatformConsole'

const kbListComponent = () =>
  isPlatformConsole()
    ? import('../views/admin/AdminKnowledgeBaseList.vue')
    : import('../views/knowledge/KnowledgeBaseList.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/platform/knowledge-bases",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/auth/Login.vue"),
      meta: { requiresAuth: false, requiresInit: false }
    },
    {
      path: "/join",
      name: "joinOrganization",
      // 重定向到组织列表页，并将 code 参数转换为 invite_code
      redirect: (to) => {
        const code = to.query.code as string
        return {
          path: '/platform/organizations',
          query: code ? { invite_code: code } : {}
        }
      },
      meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
    },
    {
      path: "/knowledgeBase",
      name: "home",
      component: () => import("../views/knowledge/KnowledgeBase.vue"),
      meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
    },
    {
      path: "/platform",
      name: "Platform",
      redirect: "/platform/knowledge-bases",
      component: () => import("../views/platform/index.vue"),
      meta: { requiresInit: true, requiresAuth: true },
      children: [
        {
          path: "tenant",
          redirect: "/platform/settings"
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("../views/settings/Settings.vue"),
          // 平台控制台需能打开全局设置（含模型管理）；勿标 requiresTenantUI，否则会被守卫重定向到知识库
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: false }
        },
        {
          path: "models",
          name: "platformModels",
          component: () => import("../views/admin/PlatformModelsPage.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "knowledge-bases",
          name: "knowledgeBaseList",
          component: kbListComponent,
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "sessions",
          name: "platformSessions",
          component: () => import("../views/admin/AdminSessionsList.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "manage/agents",
          name: "platformManageAgents",
          component: () => import("../views/admin/PlatformAgentsPage.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "manage/mcp",
          name: "platformManageMcp",
          component: () => import("../views/admin/PlatformMcpPage.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "manage/skills",
          name: "platformManageSkills",
          component: () => import("../views/admin/PlatformSkillsPage.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "knowledge-bases/:kbId",
          name: "knowledgeBaseDetail",
          component: () => import("../views/knowledge/KnowledgeBase.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
        },
        {
          path: "knowledge-search",
          name: "knowledgeSearch",
          component: () => import("../views/knowledge/KnowledgeSearch.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
        },
        {
          path: "agents",
          name: "agentList",
          component: () => import("../views/agent/AgentList.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
        },
        {
          path: "creatChat",
          name: "globalCreatChat",
          component: () => import("../views/creatChat/creatChat.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
        },
        {
          path: "knowledge-bases/:kbId/creatChat",
          name: "kbCreatChat",
          component: () => import("../views/creatChat/creatChat.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
        },
        {
          path: "chat/:chatid",
          name: "chat",
          component: () => import("../views/chat/index.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
        },
        {
          path: "organizations",
          name: "organizationList",
          component: () => import("../views/organization/OrganizationList.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresTenantUI: true }
        },
      ],
    },
  ],
});

// 路由守卫：检查认证状态和系统初始化状态
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  const hasPlatformAdminToken = !!localStorage.getItem('weknora_platform_admin_token')
  
  // 如果访问的是登录页面或初始化页面，直接放行
  if (to.meta.requiresAuth === false || to.meta.requiresInit === false) {
    // 如果已登录用户访问登录页面，重定向到知识库列表页面
    if (to.path === '/login' && authStore.isLoggedIn) {
      // 平台控制台必须以本地管理员 token 为准，避免内存态与本地态不一致导致登录页被错误重定向
      if (isPlatformConsole()) {
        if (hasPlatformAdminToken) {
          next('/platform/manage/agents')
        } else {
          next()
        }
        return
      }
      next('/platform/knowledge-bases')
      return
    }
    next()
    return
  }

  // 检查用户认证状态
  if (to.meta.requiresAuth !== false) {
    if (!authStore.isLoggedIn) {
      // 平台控制台下：如果本地仍有管理员 token，先恢复一次状态，避免误判导致跳登录页
      if (isPlatformConsole() && hasPlatformAdminToken) {
        authStore.initFromStorage()
      }
    }

    // 平台控制台下如果本地已无管理员 token，直接清理内存态，避免误判为已登录
    if (isPlatformConsole() && !hasPlatformAdminToken && authStore.isLoggedIn) {
      authStore.logout()
    }

    if (!authStore.isLoggedIn) {
      // 未登录，跳转到登录页面
      next('/login')
      return
    }

    if (to.meta.requiresTenantUI && isPlatformConsole()) {
      // 平台控制台下，旧的 /platform/agents 入口统一跳到管理页，避免被重定向到知识库
      if (to.name === 'agentList' || to.path === '/platform/agents') {
        next({ name: 'platformManageAgents', replace: true })
        return
      }
      next({ path: '/platform/knowledge-bases', replace: true })
      return
    }

    // 验证Token有效性
    // try {
    //   const { valid } = await validateToken()
    //   if (!valid) {
    //     // Token无效，清空认证信息并跳转到登录页面
    //     authStore.logout()
    //     next('/login')
    //     return
    //   }
    // } catch (error) {
    //   console.error('Token验证失败:', error)
    //   authStore.logout()
    //   next('/login')
    //   return
    // }
  }

  next()
});

export default router
