/** 当前构建是否为「平台运营控制台」（仅管理员登录，管理全局模型与跨租户数据）。默认开启；设置 VITE_PLATFORM_ADMIN=false 可恢复终端用户界面。 */
export function isPlatformConsole(): boolean {
  return import.meta.env.VITE_PLATFORM_ADMIN !== 'false'
}
