import type { OutboxItem } from "./types";

export type SyncItemCategory =
  | "diary"
  | "photo"
  | "receipt"
  | "workforce"
  | "procurement"
  | "plan"
  | "tool"
  | "task"
  | "project"
  | "report";

export type SyncErrorKind =
  "offline" | "authentication" | "conflict" | "file" | "server";

export function syncItemCategory(type: OutboxItem["type"]): SyncItemCategory {
  if (
    ["diary_entry", "day_closure", "delay_event", "weather_snapshot"].includes(
      type,
    )
  )
    return "diary";
  if (type === "attachment") return "photo";
  if (
    [
      "receipt_category",
      "receipt",
      "receipt_file",
      "receipt_ocr",
      "receipt_export",
    ].includes(type)
  )
    return "receipt";
  if (
    ["worker_checkin", "material_request"].includes(type) ||
    type.startsWith("work_shift") ||
    type.startsWith("worker_credential")
  )
    return "workforce";
  if (
    [
      "material_supplier_quote",
      "material_quote_selection",
      "material_quote_withdrawal",
    ].includes(type) ||
    type.startsWith("material_delivery") ||
    type.startsWith("material_stock") ||
    type === "task_material_requirements" ||
    type === "task_tool_requirements"
  )
    return "procurement";
  if (type === "project_plan" || type.startsWith("project_rfi")) return "plan";
  if (type.startsWith("project_tool")) return "tool";
  if (
    ["site_task", "project_checklist", "site_task_event"].includes(type) ||
    type.startsWith("safety_briefing") ||
    type.startsWith("site_incident")
  )
    return "task";
  if (
    [
      "change_order",
      "project_budget",
      "project_schedule",
      "daily_control_action",
    ].includes(type)
  )
    return "project";
  return "report";
}

export function syncErrorKind(error?: string): SyncErrorKind {
  const value = (error ?? "").toLowerCase();
  if (/network|fetch|offline|internet|timeout|timed out/.test(value))
    return "offline";
  if (/auth|jwt|session|permission|unauthorized|forbidden/.test(value))
    return "authentication";
  if (/conflict|locked|immutable|already|duplicate/.test(value))
    return "conflict";
  if (/file|upload|storage|uri|image|document|bucket/.test(value))
    return "file";
  return "server";
}

export function activeSyncItems(items: OutboxItem[]): OutboxItem[] {
  const priority = { failed: 0, syncing: 1, pending: 2, synced: 3 } as const;
  return items
    .filter((item) => item.status !== "synced")
    .sort(
      (a, b) =>
        priority[a.status] - priority[b.status] ||
        a.createdAt.localeCompare(b.createdAt),
    );
}
