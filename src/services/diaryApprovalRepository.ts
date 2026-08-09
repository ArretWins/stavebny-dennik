import type {
  CreatedDiaryApprovalRequest,
  DiaryApprovalEvent,
  DiaryApprovalRequest,
  DiaryApprovalRole,
} from "@/domain/types";
import { supabase } from "./supabase";

function requestFromRow(row: Record<string, unknown>): DiaryApprovalRequest {
  const value = (snake: string, camel: string) => row[snake] ?? row[camel];
  return {
    id: String(row.id),
    ownerId: String(value("owner_id", "ownerId")),
    projectId: String(value("project_id", "projectId")),
    closureId: String(value("closure_id", "closureId")),
    closureHash: String(value("closure_hash", "closureHash")),
    recipientName: String(value("recipient_name", "recipientName")),
    reviewerRole: String(value("reviewer_role", "reviewerRole")) as DiaryApprovalRole,
    status: String(row.status) as DiaryApprovalRequest["status"],
    expiresAt: String(value("expires_at", "expiresAt")),
    openedAt: value("opened_at", "openedAt")
      ? String(value("opened_at", "openedAt"))
      : undefined,
    viewCount: Number(value("view_count", "viewCount") ?? 0),
    decidedAt: value("decided_at", "decidedAt")
      ? String(value("decided_at", "decidedAt"))
      : undefined,
    decisionComment: value("decision_comment", "decisionComment")
      ? String(value("decision_comment", "decisionComment"))
      : undefined,
    confirmationVersion: value("confirmation_version", "confirmationVersion")
      ? "sk-v1"
      : undefined,
    revokedAt: value("revoked_at", "revokedAt")
      ? String(value("revoked_at", "revokedAt"))
      : undefined,
    createdAt: String(value("created_at", "createdAt")),
  };
}

function eventFromRow(row: Record<string, unknown>): DiaryApprovalEvent {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    requestId: String(row.request_id),
    closureId: String(row.closure_id),
    eventType: String(row.event_type) as DiaryApprovalEvent["eventType"],
    actorName: row.actor_name ? String(row.actor_name) : undefined,
    actorRole: row.actor_role ? String(row.actor_role) : undefined,
    body: row.body ? String(row.body) : undefined,
    closureHash: String(row.closure_hash),
    createdAt: String(row.created_at),
  };
}

export async function listProjectDiaryApprovals(projectId: string): Promise<{
  requests: DiaryApprovalRequest[];
  events: DiaryApprovalEvent[];
}> {
  if (!supabase) return { requests: [], events: [] };
  const [requestResult, eventResult] = await Promise.all([
    supabase
      .from("diary_approval_requests")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("diary_approval_events")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
  ]);
  if (requestResult.error) throw requestResult.error;
  if (eventResult.error) throw eventResult.error;
  return {
    requests: (requestResult.data ?? []).map(requestFromRow),
    events: (eventResult.data ?? []).map(eventFromRow),
  };
}

export async function createDiaryApprovalRequest(input: {
  closureId: string;
  recipientName: string;
  reviewerRole: DiaryApprovalRole;
  expiresHours: number;
}): Promise<CreatedDiaryApprovalRequest> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { data, error } = await supabase.rpc("create_diary_approval_request", {
    p_closure_id: input.closureId,
    p_recipient_name: input.recipientName,
    p_reviewer_role: input.reviewerRole,
    p_expires_hours: input.expiresHours,
    p_confirmed: true,
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  const token = String(row.token);
  const base =
    process.env.EXPO_PUBLIC_DIARY_APPROVAL_URL ||
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/diary-approval`;
  return {
    ...requestFromRow(row),
    token,
    url: `${base.replace(/\/+$/, "")}?token=${encodeURIComponent(token)}`,
  };
}

export async function revokeDiaryApprovalRequest(id: string): Promise<void> {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  const { error } = await supabase.rpc("revoke_diary_approval_request", {
    p_request_id: id,
  });
  if (error) throw error;
}
