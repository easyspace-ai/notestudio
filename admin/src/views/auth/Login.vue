<template>
  <div class="login-minimal">
    <div class="login-card">
      <t-form
        v-if="!isRegisterMode"
        ref="formRef"
        :data="formData"
        :rules="formRules"
        @submit="handleLogin"
        layout="vertical"
        class="login-form"
      >
        <t-form-item :label="$t('auth.email')" name="email" required-mark>
          <t-input
            v-model="formData.email"
            :placeholder="$t('auth.emailPlaceholder')"
            type="email"
            size="large"
            :disabled="loading"
          />
        </t-form-item>

        <t-form-item :label="$t('auth.password')" name="password" required-mark>
          <t-input
            v-model="formData.password"
            :placeholder="$t('auth.passwordPlaceholder')"
            type="password"
            size="large"
            :disabled="loading"
            @keydown.enter="handleLogin"
          />
        </t-form-item>

        <t-button
          type="submit"
          size="large"
          block
          :loading="loading"
          class="submit-button"
        >
          {{ loading ? $t('auth.loggingIn') : $t('auth.login') }}
        </t-button>
      </t-form>

      <template v-else>
        <t-form
          ref="registerFormRef"
          :data="registerData"
          :rules="registerRules"
          @submit="handleRegister"
          layout="vertical"
          class="login-form"
        >
          <t-form-item :label="$t('auth.username')" name="username">
            <t-input
              v-model="registerData.username"
              :placeholder="$t('auth.usernamePlaceholder')"
              size="large"
              :disabled="loading"
            />
          </t-form-item>

          <t-form-item :label="$t('auth.email')" name="email" required-mark>
            <t-input
              v-model="registerData.email"
              :placeholder="$t('auth.emailPlaceholder')"
              type="email"
              size="large"
              :disabled="loading"
            />
          </t-form-item>

          <t-form-item :label="$t('auth.password')" name="password" required-mark>
            <t-input
              v-model="registerData.password"
              :placeholder="$t('auth.passwordPlaceholder')"
              type="password"
              size="large"
              :disabled="loading"
            />
          </t-form-item>

          <t-form-item :label="$t('auth.confirmPassword')" name="confirmPassword" required-mark>
            <t-input
              v-model="registerData.confirmPassword"
              :placeholder="$t('auth.confirmPasswordPlaceholder')"
              type="password"
              size="large"
              :disabled="loading"
              @keydown.enter="handleRegister"
            />
          </t-form-item>

          <t-button
            type="submit"
            size="large"
            block
            :loading="loading"
            class="submit-button"
          >
            {{ loading ? $t('auth.registering') : $t('auth.register') }}
          </t-button>
        </t-form>
      </template>

      <p v-if="!isPlatformConsole()" class="mode-toggle">
        <button type="button" class="mode-toggle-btn" @click="toggleMode">
          {{ isRegisterMode ? $t('auth.backToLogin') : $t('auth.registerNow') }}
        </button>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { login, register } from '@/api/auth'
import { platformAdminLogin } from '@/api/platform-admin'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from 'vue-i18n'
import { isPlatformConsole } from '@/composables/usePlatformConsole'

const router = useRouter()
const authStore = useAuthStore()
const { t } = useI18n()

const formRef = ref()
const registerFormRef = ref()

const loading = ref(false)
const isRegisterMode = ref(false)

const formData = reactive<{ [key: string]: string }>({
  email: '',
  password: '',
})

const registerData = reactive<{ [key: string]: string }>({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
})

const formRules = computed(() => ({
  email: [
    { required: true, message: t('auth.emailRequired'), type: 'error' },
    { email: true, message: t('auth.emailInvalid'), type: 'error' },
  ],
  password: [
    { required: true, message: t('auth.passwordRequired'), type: 'error' },
    { min: 8, message: t('auth.passwordMinLength'), type: 'error' },
    { max: 32, message: t('auth.passwordMaxLength'), type: 'error' },
    { pattern: /[a-zA-Z]/, message: t('auth.passwordMustContainLetter'), type: 'error' },
    { pattern: /\d/, message: t('auth.passwordMustContainNumber'), type: 'error' },
  ],
}))

const registerRules = computed(() => ({
  username: [
    { required: true, message: t('auth.usernameRequired'), type: 'error' },
    { min: 2, message: t('auth.usernameMinLength'), type: 'error' },
    { max: 20, message: t('auth.usernameMaxLength'), type: 'error' },
    {
      pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
      message: t('auth.usernameInvalid'),
      type: 'error',
    },
  ],
  email: [
    { required: true, message: t('auth.emailRequired'), type: 'error' },
    { email: true, message: t('auth.emailInvalid'), type: 'error' },
  ],
  password: [
    { required: true, message: t('auth.passwordRequired'), type: 'error' },
    { min: 8, message: t('auth.passwordMinLength'), type: 'error' },
    { max: 32, message: t('auth.passwordMaxLength'), type: 'error' },
    { pattern: /[a-zA-Z]/, message: t('auth.passwordMustContainLetter'), type: 'error' },
    { pattern: /\d/, message: t('auth.passwordMustContainNumber'), type: 'error' },
  ],
  confirmPassword: [
    { required: true, message: t('auth.confirmPasswordRequired'), type: 'error' },
    {
      validator: (val: string) => val === registerData.password,
      message: t('auth.passwordMismatch'),
      type: 'error',
    },
  ],
}))

const toggleMode = () => {
  isRegisterMode.value = !isRegisterMode.value
  Object.keys(registerData).forEach((key) => {
    ;(registerData as Record<string, string>)[key] = ''
  })
}

const persistLoginResponse = async (response: any) => {
  if (response.user && response.tenant && response.token) {
    authStore.setUser({
      id: response.user.id || '',
      username: response.user.username || '',
      email: response.user.email || '',
      avatar: response.user.avatar,
      tenant_id: String(response.tenant.id) || '',
      can_access_all_tenants: response.user.can_access_all_tenants || false,
      created_at: response.user.created_at || new Date().toISOString(),
      updated_at: response.user.updated_at || new Date().toISOString(),
    })
    authStore.setToken(response.token)
    if (response.refresh_token) {
      authStore.setRefreshToken(response.refresh_token)
    }
    authStore.setTenant({
      id: String(response.tenant.id) || '',
      name: response.tenant.name || '',
      api_key: response.tenant.api_key || '',
      owner_id: response.user.id || '',
      created_at: response.tenant.created_at || new Date().toISOString(),
      updated_at: response.tenant.updated_at || new Date().toISOString(),
    })
  }

  await nextTick()
  router.replace('/platform/knowledge-bases')
}

const handleLogin = async () => {
  try {
    const valid = await formRef.value?.validate()
    if (valid !== true) return

    loading.value = true

    if (isPlatformConsole()) {
      const data = await platformAdminLogin(formData.email, formData.password)
      authStore.clearEndUserSession()
      authStore.setPlatformAdminSession(data.access_token, data.admin)
      MessagePlugin.success(t('auth.loginSuccess'))
      await nextTick()
      router.replace('/platform/knowledge-bases')
      return
    }

    const response = await login({
      email: formData.email,
      password: formData.password,
    })

    if (response.success) {
      MessagePlugin.success(t('auth.loginSuccess'))
      await persistLoginResponse(response)
    } else {
      MessagePlugin.error(response.message || t('auth.loginError'))
    }
  } catch (error: any) {
    console.error('登录错误:', error)
    MessagePlugin.error(error.message || t('auth.loginErrorRetry'))
  } finally {
    loading.value = false
  }
}

const handleRegister = async () => {
  try {
    const valid = await registerFormRef.value?.validate()
    if (valid !== true) return

    loading.value = true

    const response = await register({
      username: registerData.username,
      email: registerData.email,
      password: registerData.password,
    })

    if (response.success) {
      MessagePlugin.success(t('auth.registerSuccess'))
      isRegisterMode.value = false
      formData.email = registerData.email
      Object.keys(registerData).forEach((key) => {
        ;(registerData as Record<string, string>)[key] = ''
      })
    } else {
      MessagePlugin.error(response.message || t('auth.registerFailed'))
    }
  } catch (error: any) {
    console.error('注册错误:', error)
    MessagePlugin.error(error.message || t('auth.registerError'))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (authStore.isLoggedIn) {
    router.replace('/platform/knowledge-bases')
  }
})
</script>

<style lang="less" scoped>
.login-minimal {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: #f4f4f5;
}

.login-card {
  width: 100%;
  max-width: 420px;
  padding: 32px 28px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e4e4e7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.login-form {
  :deep(.t-form-item__label) {
    font-size: 14px;
    font-weight: 500;
    color: var(--td-text-color-primary);
  }

  :deep(.t-input) {
    border-radius: 8px;
  }
}

.submit-button {
  margin-top: 8px;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  background: #10c15c !important;
  color: #fff !important;

  &:hover {
    background: #0ea854 !important;
    color: #fff !important;
  }
}

.mode-toggle {
  margin: 20px 0 0;
  text-align: center;
}

.mode-toggle-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 14px;
  color: var(--td-brand-color);
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;

  &:hover {
    color: var(--td-brand-color-active);
  }
}
</style>
