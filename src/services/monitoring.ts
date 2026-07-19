import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

type DiagnosticContext = {
  operation?: string;
  entityType?: string;
  pendingCount?: number;
  failedCount?: number;
  network?: "online" | "offline" | "unknown";
};

const appVersion = Constants.expoConfig?.version ?? "unknown";
const platform = Platform.OS === "ios" ? "ios" : "android";
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,79}$/;

export function diagnosticCode(error: unknown): string {
  if (error && typeof error === "object") {
    const candidate = "code" in error ? String(error.code) : "name" in error ? String(error.name) : "";
    if (SAFE_CODE.test(candidate)) return candidate;
  }
  if (error instanceof Error && SAFE_CODE.test(error.message)) return error.message;
  return "UNEXPECTED_ERROR";
}

export async function recordClientError(input: {
  source: "app" | "sync" | "auth" | "edge";
  severity?: "warning" | "error" | "fatal";
  error: unknown;
  safeMessage?: string;
  context?: DiagnosticContext;
  projectId?: string;
}): Promise<void> {
  if (!supabase) return;
  const result = await supabase.rpc("record_client_error", {
    p_source: input.source,
    p_severity: input.severity ?? "error",
    p_error_code: diagnosticCode(input.error),
    p_safe_message: input.safeMessage?.slice(0, 500) ?? null,
    p_context: input.context ?? {},
    p_project_id: input.projectId ?? null,
    p_app_version: appVersion,
    p_platform: platform,
  });
  if (result.error) console.warn("Unable to record diagnostic", result.error.code);
}

export async function recordSyncRun(input: {
  status: "success" | "partial" | "failed";
  pendingBefore: number;
  pendingAfter: number;
  failedCount: number;
  durationMs: number;
  error?: unknown;
  projectId?: string;
}): Promise<void> {
  if (!supabase) return;
  const result = await supabase.rpc("record_sync_run", {
    p_status: input.status,
    p_pending_before: input.pendingBefore,
    p_pending_after: input.pendingAfter,
    p_failed_count: input.failedCount,
    p_duration_ms: input.durationMs,
    p_error_code: input.error ? diagnosticCode(input.error) : null,
    p_project_id: input.projectId ?? null,
  });
  if (result.error) console.warn("Unable to record sync run", result.error.code);
}

export async function submitSupportReport(
  subject: string,
  description: string,
  diagnostics: DiagnosticContext & { projectId?: string },
): Promise<string> {
  if (!supabase) throw new Error("SERVER_NOT_CONFIGURED");
  const result = await supabase.rpc("submit_support_report", {
    p_subject: subject,
    p_description: description,
    p_diagnostics: { ...diagnostics, appVersion, platform },
  });
  if (result.error) throw result.error;
  return String(result.data);
}

export const runtimeDiagnostics = { appVersion, platform };
