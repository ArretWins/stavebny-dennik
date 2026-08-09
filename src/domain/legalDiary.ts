import type {
  DiaryTechnicalCategory,
  DiaryTechnicalRecord,
  DiaryWorkforceRole,
} from "./types";

export const DIARY_TECHNICAL_CATEGORIES = [
  "site_inspection",
  "authority_supervision",
  "contractual_fact",
  "material_delivery",
  "product_certificate",
  "equipment_use",
  "work_interruption",
  "adverse_condition",
  "schedule_impact",
  "site_find",
  "foundation_acceptance",
  "test_measurement",
  "quality_fact",
  "technical_inspection",
  "safety_instruction",
  "injury",
  "project_deviation",
  "waste_management",
  "consent_other",
] as const satisfies readonly DiaryTechnicalCategory[];

export interface DiaryLegalDetails {
  workStartTime?: string;
  workEndTime?: string;
  workforceRoles: DiaryWorkforceRole[];
  technicalRecords: DiaryTechnicalRecord[];
}

export type DiaryLegalValidationError =
  | "invalid_work_time"
  | "invalid_workforce_roles"
  | "workforce_total_mismatch"
  | "invalid_technical_records";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateDiaryLegalDetails(
  details: DiaryLegalDetails & { workerCount: number },
): DiaryLegalValidationError | undefined {
  const hasStart = Boolean(details.workStartTime);
  const hasEnd = Boolean(details.workEndTime);
  if (
    hasStart !== hasEnd ||
    (hasStart &&
      (!timePattern.test(details.workStartTime!) ||
        !timePattern.test(details.workEndTime!) ||
        details.workStartTime! >= details.workEndTime!))
  )
    return "invalid_work_time";
  if (details.workforceRoles.length > 50) return "invalid_workforce_roles";
  const roleKeys = new Set<string>();
  for (const item of details.workforceRoles) {
    const key = item.role.trim().toLocaleLowerCase("sk-SK");
    if (
      item.role.trim().length < 2 ||
      item.role.trim().length > 80 ||
      !Number.isInteger(item.count) ||
      item.count < 1 ||
      item.count > 999 ||
      roleKeys.has(key)
    )
      return "invalid_workforce_roles";
    roleKeys.add(key);
  }
  if (
    details.workforceRoles.length &&
    details.workforceRoles.reduce((sum, item) => sum + item.count, 0) !==
      details.workerCount
  )
    return "workforce_total_mismatch";
  if (details.technicalRecords.length > 50) return "invalid_technical_records";
  const ids = new Set<string>();
  for (const item of details.technicalRecords) {
    if (
      item.id.trim().length < 3 ||
      item.id.length > 160 ||
      !DIARY_TECHNICAL_CATEGORIES.includes(item.category) ||
      item.description.trim().length < 3 ||
      item.description.trim().length > 500 ||
      (item.reference?.trim().length ?? 0) > 120 ||
      ids.has(item.id)
    )
      return "invalid_technical_records";
    ids.add(item.id);
  }
  return undefined;
}

export function normalizeDiaryLegalDetails(
  details: DiaryLegalDetails,
): DiaryLegalDetails {
  return {
    workStartTime: details.workStartTime || undefined,
    workEndTime: details.workEndTime || undefined,
    workforceRoles: details.workforceRoles.map((item) => ({
      role: item.role.trim(),
      count: item.count,
    })),
    technicalRecords: details.technicalRecords.map((item) => ({
      ...item,
      description: item.description.trim(),
      reference: item.reference?.trim() || undefined,
    })),
  };
}
