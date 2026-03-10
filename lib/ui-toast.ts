import { toast } from "sonner";

import type { IpSearchStatus } from "@/lib/ip-search";

export type ToastLevel = "success" | "info" | "warning" | "error";

export const TOAST_PRIORITY: Record<ToastLevel, number> = {
  success: 1,
  info: 2,
  warning: 3,
  error: 4,
};

export const TOAST_IDS = {
  ipSearchFeedback: "ip-search-feedback",
} as const;

export function showLeveledToast(level: ToastLevel, message: string, id: string) {
  toast[level](message, { id });
}

export function getIpSearchToastLevel(status: IpSearchStatus): ToastLevel | null {
  if (status === "not_found") return "info";
  if (status === "invalid") return "warning";
  if (status === "error") return "error";
  return null;
}