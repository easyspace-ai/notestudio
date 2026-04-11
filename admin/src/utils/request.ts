// src/utils/request.js
import axios from "axios";
import { generateRandomString } from "./index";
import i18n from '@/i18n'

const t = (key: string) => i18n.global.t(key)

// API基础URL
const BASE_URL = import.meta.env.VITE_IS_DOCKER ? "" : "http://localhost:8080";


// 创建Axios实例
const instance = axios.create({
  baseURL: BASE_URL, // 使用配置的API基础URL
  timeout: 30000, // 请求超时时间
  headers: {
    "Content-Type": "application/json",
    "X-Request-ID": `${generateRandomString(12)}`,
  },
});

// 获取当前用户语言（用于 Accept-Language header）
function getCurrentLanguage(): string {
  return i18n.global.locale?.value || localStorage.getItem('locale') || 'zh-CN'
}

/**
 * 平台管理员仅持有 admin token、未登录终端用户时：这些租户域 API 需携带 admin JWT +「管理租户」X-Tenant-ID，
 * 否则无 Authorization 会 401 并被重定向到登录页（例如 Agent 管理页打开编辑弹窗时加载模型/知识库等）。
 */
function shouldUsePlatformTenantProxy(reqUrl: string): boolean {
  return (
    reqUrl.includes('/api/v1/agents') ||
    reqUrl.includes('/api/v1/mcp-services') ||
    reqUrl.includes('/api/v1/skills') ||
    reqUrl.includes('/api/v1/models') ||
    reqUrl.includes('/api/v1/knowledge-bases') ||
    reqUrl.includes('/api/v1/shared-knowledge-bases') ||
    reqUrl.includes('/api/v1/shared-agents') ||
    reqUrl.includes('/api/v1/organizations') ||
    reqUrl.includes('/api/v1/tenants/kv/') ||
    reqUrl.includes('/api/v1/web-search-providers') ||
    reqUrl.includes('/api/v1/system/storage-engine-status') ||
    reqUrl.includes('/api/v1/system/info') ||
    reqUrl.includes('/api/v1/system/parser-engines') ||
    reqUrl.includes('/api/v1/system/docreader/reconnect') ||
    reqUrl.includes('/api/v1/auth/me') ||
    reqUrl.includes('/api/v1/auth/tenant') ||
    // 平台管理员未登录终端用户时：Ollama 状态/模型等需带 admin JWT（见 middleware tryPlatformAdminOllamaInitAuth）
    reqUrl.includes('/api/v1/initialization/ollama')
  )
}

instance.interceptors.request.use(
  (config) => {
    const reqUrl = String(config.url || '')
    const isAdminApi = reqUrl.includes('/api/v1/admin')

    if (isAdminApi) {
      const adminTok = localStorage.getItem('weknora_platform_admin_token')
      if (adminTok) {
        config.headers["Authorization"] = `Bearer ${adminTok}`
      } else {
        delete (config.headers as any)["Authorization"]
      }
      config.headers["Accept-Language"] = getCurrentLanguage()
      config.headers["X-Request-ID"] = `${generateRandomString(12)}`
      return config
    }

    const adminTok = localStorage.getItem('weknora_platform_admin_token')
    const userTok = localStorage.getItem('weknora_token')
    const usePlatformTenantProxy =
      !!adminTok && !userTok && shouldUsePlatformTenantProxy(reqUrl)

    if (usePlatformTenantProxy) {
      config.headers["Authorization"] = `Bearer ${adminTok}`
      const tid = localStorage.getItem('weknora_platform_manage_tenant_id')
      if (tid) {
        config.headers["X-Tenant-ID"] = tid
      } else {
        // 平台管理员但未选择租户：可以在这里显示提示或阻止请求
        console.warn('Platform admin: No tenant selected yet. Please select a tenant in the top bar.')
      }
    } else if (userTok) {
      config.headers["Authorization"] = `Bearer ${userTok}`
    }

    config.headers["Accept-Language"] = getCurrentLanguage()

    if (!usePlatformTenantProxy) {
      const selectedTenantId = localStorage.getItem('weknora_selected_tenant_id')
      const defaultTenantId = localStorage.getItem('weknora_tenant')
      if (selectedTenantId) {
        try {
          const defaultTenant = defaultTenantId ? JSON.parse(defaultTenantId) : null
          const defaultId = defaultTenant?.id ? String(defaultTenant.id) : null
          if (selectedTenantId !== defaultId) {
            config.headers["X-Tenant-ID"] = selectedTenantId
          }
        } catch (e) {
          console.error('Failed to parse tenant info', e)
        }
      }
    }

    config.headers["X-Request-ID"] = `${generateRandomString(12)}`
    return config
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Token刷新标志，防止多个请求同时刷新token
let isRefreshing = false;
let failedQueue: Array<{ resolve: Function; reject: Function }> = [];
let hasRedirectedOn401 = false;

// 处理队列中的请求
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

instance.interceptors.response.use(
  (response) => {
    // 根据业务状态码处理逻辑
    const { status, data } = response;
    if (status >= 200 && status < 300) {
      return data;
    } else {
      return Promise.reject(data);
    }
  },
  async (error: any) => {
    const originalRequest = error.config;
    const adminTok = localStorage.getItem('weknora_platform_admin_token')
    const userTok = localStorage.getItem('weknora_token')
    const isPlatformAdminSession = !!adminTok && !userTok
    
    if (!error.response) {
      return Promise.reject({ message: t('error.networkError') });
    }
    
    // 如果是登录接口的401，直接返回错误以便页面展示toast，不做跳转
    if (
      error.response.status === 401 &&
      (originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/admin/auth/login'))
    ) {
      const { status, data } = error.response;
      // 与下方统一：后端为 { success:false, error:{ message } }
      let msg: string | undefined;
      if (typeof data === 'object' && data !== null) {
        const d = data as { message?: string; error?: string | { message?: string } };
        if (typeof d.error === 'string') msg = d.error;
        else if (d.error && typeof d.error === 'object' && d.error.message) msg = d.error.message;
        else msg = d.message;
      }
      return Promise.reject({ status, message: msg || t('error.invalidCredentials') });
    }

    // 平台管理员 API 401：不刷新用户 refresh_token，直接清管理员态并回登录页
    if (error.response.status === 401 && originalRequest?.url?.includes('/api/v1/admin') && !originalRequest?.url?.includes('/admin/auth/login')) {
      localStorage.removeItem('weknora_platform_admin_token')
      localStorage.removeItem('weknora_platform_admin')
      if (!hasRedirectedOn401 && typeof window !== 'undefined') {
        hasRedirectedOn401 = true
        window.location.href = '/login'
      }
      return Promise.reject({ message: t('error.pleaseRelogin') })
    }

    // 平台管理员会话下，业务接口 400/401 特殊处理
    if (
      isPlatformAdminSession &&
      !originalRequest?.url?.includes('/api/v1/admin/auth/login')
    ) {
      const { status, data } = error.response;
      let msg: string | undefined;
      if (typeof data === 'object' && data !== null) {
        const d = data as { message?: string; error?: string | { message?: string } };
        if (typeof d.error === 'string') msg = d.error;
        else if (d.error && typeof d.error === 'object' && d.error.message) msg = d.error.message;
        else msg = d.message;
      }

      // 特殊处理：未选择租户的错误提示
      if (status === 400 && msg?.includes('select a tenant')) {
        // 显示更友好的提示
        console.warn('Please select a tenant in the top bar first.');
        return Promise.reject({
          status,
          message: '请先在顶部「管理租户」中选择一个租户',
          _tenantRequired: true
        })
      }

      if (status === 401) {
        return Promise.reject({ status, message: msg || t('error.pleaseRelogin') })
      }
    }

    // 如果是401错误且不是刷新token的请求，尝试刷新token
    if (error.response.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      if (isRefreshing) {
        // 如果正在刷新token，将请求加入队列
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return instance(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      const refreshToken = localStorage.getItem('weknora_refresh_token');
      
      if (refreshToken) {
        try {
          // 动态导入refresh token API
          const { refreshToken: refreshTokenAPI } = await import('../api/auth/index');
          const response = await refreshTokenAPI(refreshToken);
          
          if (response.success && response.data) {
            const { token, refreshToken: newRefreshToken } = response.data;
            
            // 更新localStorage中的token
            localStorage.setItem('weknora_token', token);
            localStorage.setItem('weknora_refresh_token', newRefreshToken);
            
            // 更新请求头
            originalRequest.headers['Authorization'] = 'Bearer ' + token;
            
            // 处理队列中的请求
            processQueue(null, token);
            
            return instance(originalRequest);
          } else {
            throw new Error(response.message || t('error.tokenRefreshFailed'));
          }
        } catch (refreshError) {
          // 刷新失败，清除所有token并跳转到登录页
          localStorage.removeItem('weknora_token');
          localStorage.removeItem('weknora_refresh_token');
          localStorage.removeItem('weknora_user');
          localStorage.removeItem('weknora_tenant');
          
          processQueue(refreshError, null);
          
          // 跳转到登录页
          if (!hasRedirectedOn401 && typeof window !== 'undefined') {
            hasRedirectedOn401 = true;
            window.location.href = '/login';
          }
          
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      } else {
        // 没有refresh token，直接跳转到登录页
        localStorage.removeItem('weknora_token');
        localStorage.removeItem('weknora_user');
        localStorage.removeItem('weknora_tenant');
        
        if (!hasRedirectedOn401 && typeof window !== 'undefined') {
          hasRedirectedOn401 = true;
          window.location.href = '/login';
        }
        
        return Promise.reject({ message: t('error.pleaseRelogin') });
      }
    }
    
    // 处理 Nginx 413 Request Entity Too Large
    if (error.response.status === 413) {
      return Promise.reject({ 
        status: 413, 
        message: t('error.fileSizeExceeded'),
        success: false
      });
    }

    const { status, data } = error.response;
    // 将HTTP状态码一并抛出，方便上层判断401等场景
    // 后端返回格式: { success: false, error: { code, message, details } }
    // 提取 error.message 作为顶层 message，方便前端使用 error?.message 获取
    let errorMessage: string | undefined;
    if (typeof data === 'object') {
      if (typeof data?.error === 'string') {
        errorMessage = data.error;
      } else if (data?.error?.message) {
        errorMessage = data.error.message;
      } else {
        errorMessage = data?.message;
      }
    } else if (typeof data === 'string') {
      errorMessage = data;
    }
    return Promise.reject({ 
      status, 
      message: errorMessage,
      ...(typeof data === 'object' ? data : {}) 
    });
  }
);

export function get(url: string) {
  return instance.get(url);
}

export async function getDown(url: string) {
  let res = await instance.get(url, {
    responseType: "blob",
  });
  return res
}

export function postUpload(url: string, data = {}, onUploadProgress?: (progressEvent: any) => void) {
  return instance.post(url, data, {
    headers: {
      "Content-Type": "multipart/form-data",
      "X-Request-ID": `${generateRandomString(12)}`,
    },
    onUploadProgress,
  });
}

export function postChat(url: string, data = {}) {
  return instance.post(url, data, {
    headers: {
      "Content-Type": "text/event-stream;charset=utf-8",
      "X-Request-ID": `${generateRandomString(12)}`,
    },
  });
}

export function post(url: string, data = {}, config?: any) {
  return instance.post(url, data, config);
}

export function put(url: string, data = {}) {
  return instance.put(url, data);
}

export function patch(url: string, data = {}) {
  return instance.patch(url, data);
}

export function del(url: string, data?: any) {
  return instance.delete(url, { data });
}
