import { Brain, FileCode, Mic, Presentation, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Icon keys from SKILL scan / admin `studio_ui.icon`. */
export function studioQuickSkillIcon(icon: string): LucideIcon {
  switch (icon) {
    case "presentation":
      return Presentation;
    case "file-code":
      return FileCode;
    case "mic":
      return Mic;
    case "brain":
      return Brain;
    default:
      return Sparkles;
  }
}

export function studioQuickIconTone(icon: string): string {
  if (icon === "presentation") return "text-indigo-500";
  if (icon === "file-code") return "text-emerald-500";
  if (icon === "mic") return "text-violet-500";
  if (icon === "brain") return "text-amber-600";
  return "text-gray-500";
}
