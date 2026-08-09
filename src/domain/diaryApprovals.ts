import type {
  DiaryApprovalRequest,
  DiaryApprovalRole,
  DiaryApprovalStatus,
} from "./types";

export type DiaryApprovalEffectiveStatus = DiaryApprovalStatus | "expired";

export function diaryApprovalEffectiveStatus(
  request: DiaryApprovalRequest,
  now = new Date(),
): DiaryApprovalEffectiveStatus {
  if (request.status === "pending" && new Date(request.expiresAt) <= now)
    return "expired";
  return request.status;
}

export function diaryApprovalRoleKey(role: DiaryApprovalRole): string {
  return `diaryApproval.roles.${role}`;
}

export function pendingDiaryApprovals(
  requests: DiaryApprovalRequest[],
  projectId: string,
  now = new Date(),
): DiaryApprovalRequest[] {
  return requests.filter(
    (item) =>
      item.projectId === projectId &&
      diaryApprovalEffectiveStatus(item, now) === "pending",
  );
}
