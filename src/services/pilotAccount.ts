import type {
  FeatureEntitlement,
  PilotAccountStatus,
  PlanKey,
} from "@/domain/types";
import { supabase } from "./supabase";

const periodStart = `${new Date().toISOString().slice(0, 7)}-01`;
const offlineFreeEntitlements: FeatureEntitlement[] = [
  { featureKey: "projects", enabled: true, resourceLimit: 3, used: 0 },
  {
    featureKey: "workers_per_project",
    enabled: true,
    resourceLimit: 20,
    used: 0,
  },
  {
    featureKey: "receipt_storage_bytes",
    enabled: true,
    resourceLimit: 750 * 1024 * 1024,
    used: 0,
  },
  {
    featureKey: "attachment_storage_bytes",
    enabled: true,
    resourceLimit: 150 * 1024 * 1024,
    used: 0,
  },
  {
    featureKey: "receipt_ocr",
    enabled: true,
    monthlyLimit: 100,
    used: 0,
  },
  {
    featureKey: "receipt_exports",
    enabled: true,
    monthlyLimit: 20,
    used: 0,
  },
  { featureKey: "worker_portal", enabled: true, used: 0 },
  { featureKey: "material_requests", enabled: true, used: 0 },
];

export async function loadPilotAccountStatus(): Promise<PilotAccountStatus> {
  if (!supabase)
    return {
      plan: "free",
      analyticsEnabled: true,
      entitlements: offlineFreeEntitlements,
    };
  const auth = await supabase.auth.getUser();
  if (auth.error) throw auth.error;
  if (!auth.data.user) throw new Error("NOT_AUTHENTICATED");
  const [planResult, preferenceResult] = await Promise.all([
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("user_id", auth.data.user.id)
      .maybeSingle(),
    supabase
      .from("analytics_preferences")
      .select("enabled")
      .eq("user_id", auth.data.user.id)
      .maybeSingle(),
  ]);
  if (planResult.error) throw planResult.error;
  if (preferenceResult.error) throw preferenceResult.error;
  const premiumActive =
    planResult.data?.plan_key === "premium" &&
    (!planResult.data.premium_until ||
      new Date(planResult.data.premium_until) > new Date());
  const plan: PlanKey = premiumActive ? "premium" : "free";
  const [entitlementResult, usageResult, receiptStorage, attachmentStorage] =
    await Promise.all([
      supabase
        .from("feature_entitlements")
        .select("*")
        .eq("plan_key", plan)
        .order("feature_key"),
      supabase
        .from("feature_usage_monthly")
        .select("*")
        .eq("user_id", auth.data.user.id)
        .eq("period_start", periodStart),
      supabase.rpc("assert_upload_allowed", { p_kind: "receipt", p_bytes: 0 }),
      supabase.rpc("assert_upload_allowed", {
        p_kind: "attachment",
        p_bytes: 0,
      }),
    ]);
  if (entitlementResult.error) throw entitlementResult.error;
  if (usageResult.error) throw usageResult.error;
  if (receiptStorage.error) throw receiptStorage.error;
  if (attachmentStorage.error) throw attachmentStorage.error;
  const usage = new Map(
    (usageResult.data ?? []).map((row) => [
      String(row.feature_key),
      Number(row.usage_count),
    ]),
  );
  const storageUsed = new Map<string, number>([
    ["receipt_storage_bytes", Number(receiptStorage.data?.used ?? 0)],
    ["attachment_storage_bytes", Number(attachmentStorage.data?.used ?? 0)],
  ]);
  const entitlements: FeatureEntitlement[] = (entitlementResult.data ?? []).map(
    (row) => ({
      featureKey: String(row.feature_key),
      enabled: Boolean(row.enabled),
      monthlyLimit:
        row.monthly_limit === null ? undefined : Number(row.monthly_limit),
      resourceLimit:
        row.resource_limit === null ? undefined : Number(row.resource_limit),
      used:
        storageUsed.get(String(row.feature_key)) ??
        usage.get(String(row.feature_key)) ??
        0,
    }),
  );
  return {
    plan,
    premiumUntil: planResult.data?.premium_until
      ? String(planResult.data.premium_until)
      : undefined,
    analyticsEnabled: preferenceResult.data?.enabled ?? true,
    entitlements,
  };
}

export async function setAnonymousAnalytics(enabled: boolean): Promise<void> {
  if (!supabase) return;
  const result = await supabase.rpc("set_analytics_enabled", {
    p_enabled: enabled,
  });
  if (result.error) throw result.error;
}
export async function trackPilotEvent(
  eventName: string,
  properties: Record<string, string | number> = {},
): Promise<void> {
  if (!supabase) return;
  await supabase.rpc("track_analytics_event", {
    p_event_name: eventName,
    p_properties: properties,
  });
}
