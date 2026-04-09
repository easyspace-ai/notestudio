const PREFIX = "metanote_profile_display_name";

export function profileDisplayNameKey(userId: string | number): string {
  return `${PREFIX}_${String(userId)}`;
}

export function getProfileDisplayName(userId: string | number, email: string): string {
  if (typeof window === "undefined") {
    const part = email.split("@")[0]?.trim();
    return part || "用户";
  }
  try {
    const s = window.localStorage.getItem(profileDisplayNameKey(userId));
    if (s?.trim()) return s.trim();
  } catch {
    /* ignore */
  }
  const part = email.split("@")[0]?.trim();
  return part || "用户";
}

export function setProfileDisplayName(userId: string | number, name: string): void {
  try {
    window.localStorage.setItem(profileDisplayNameKey(userId), name.trim());
    window.dispatchEvent(new Event("metanote-profile-updated"));
  } catch {
    /* ignore */
  }
}
