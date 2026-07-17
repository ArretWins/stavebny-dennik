import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { BarChart3, Crown, HardDrive, ShieldCheck } from "lucide-react-native";
import { Card, ScreenShell, SecondaryButton, TopBar } from "@/components/ui";
import type { PilotAccountStatus } from "@/domain/types";
import { t } from "@/i18n";
import {
  loadPilotAccountStatus,
  setAnonymousAnalytics,
  trackPilotEvent,
} from "@/services/pilotAccount";
import { colors, radius, spacing, typeScale } from "@/theme/tokens";

const featureLabels: Record<string, string> = {
  projects: "Projekty",
  workers_per_project: "Pracovníci na objekt",
  receipt_storage_bytes: "Úložisko dokladov",
  attachment_storage_bytes: "Úložisko fotodôkazov",
  receipt_ocr: "OCR dokladov za mesiac",
  receipt_exports: "PDF balíky za mesiac",
  worker_portal: "Portál pracovníkov",
  material_requests: "Žiadosti o materiál",
};
function bytes(value: number): string {
  return value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(value / 1024 ** 2)} MB`;
}
function LimitRow({
  featureKey,
  used,
  monthlyLimit,
  resourceLimit,
}: PilotAccountStatus["entitlements"][number]) {
  const limit = resourceLimit ?? monthlyLimit;
  const isStorage = featureKey.endsWith("_bytes");
  const ratio = limit ? Math.min(1, used / limit) : 0;
  return (
    <View style={styles.limit}>
      <View style={styles.row}>
        <Text style={styles.limitName}>
          {featureLabels[featureKey] ?? featureKey}
        </Text>
        <Text style={styles.limitValue}>
          {limit === undefined
            ? t("pilotAccount.unlimited")
            : `${isStorage ? bytes(used) : used} / ${isStorage ? bytes(limit) : limit}`}
        </Text>
      </View>
      {limit !== undefined ? (
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.max(ratio * 100, used ? 3 : 0)}%` },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

export function PilotAccountScreen({ navigation }: { navigation: any }) {
  const [status, setStatus] = useState<PilotAccountStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const refresh = async () => {
    setError(false);
    try {
      setStatus(await loadPilotAccountStatus());
    } catch {
      setError(true);
    }
  };
  useEffect(() => {
    let mounted = true;
    void loadPilotAccountStatus()
      .then((next) => mounted && setStatus(next))
      .catch(() => mounted && setError(true));
    return () => {
      mounted = false;
    };
  }, []);
  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      await setAnonymousAnalytics(value);
      setStatus((current) =>
        current ? { ...current, analyticsEnabled: value } : current,
      );
      if (value)
        void trackPilotEvent("analytics_changed", {
          status: "enabled",
          platform: "android",
        });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScreenShell>
      <TopBar
        title={t("pilotAccount.title")}
        onBack={() => navigation.goBack()}
      />
      {error ? (
        <Card>
          <Text style={styles.note}>{t("errors.generic")}</Text>
          <SecondaryButton
            title={t("app.retry")}
            onPress={() => void refresh()}
          />
        </Card>
      ) : !status ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <Card style={styles.planCard}>
            <View style={styles.row}>
              <View style={styles.planIcon}>
                {status.plan === "premium" ? (
                  <Crown color={colors.warning} size={26} />
                ) : (
                  <ShieldCheck color={colors.primary} size={26} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.eyebrow}>
                  {t("pilotAccount.currentPlan")}
                </Text>
                <Text style={styles.plan}>
                  {status.plan === "premium"
                    ? t("pilotAccount.premium")
                    : t("pilotAccount.freePilot")}
                </Text>
                <Text style={styles.note}>
                  {status.plan === "premium"
                    ? t("pilotAccount.premiumHint")
                    : t("pilotAccount.freeHint")}
                </Text>
              </View>
            </View>
          </Card>
          <Card>
            <View style={styles.section}>
              <HardDrive color={colors.primary} size={22} />
              <Text style={styles.heading}>{t("pilotAccount.usage")}</Text>
            </View>
            {status.entitlements
              .filter((item) => item.enabled)
              .map((item) => (
                <LimitRow key={item.featureKey} {...item} />
              ))}
          </Card>
          <Card>
            <View style={styles.row}>
              <View style={styles.analyticsIcon}>
                <BarChart3 color={colors.primary} size={22} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.heading}>
                  {t("pilotAccount.analytics")}
                </Text>
                <Text style={styles.note}>
                  {t("pilotAccount.analyticsHint")}
                </Text>
              </View>
              <Switch
                value={status.analyticsEnabled}
                disabled={busy}
                onValueChange={(value) => void toggle(value)}
                trackColor={{ false: colors.border, true: "#9BC69E" }}
                thumbColor={
                  status.analyticsEnabled ? colors.primary : colors.textMuted
                }
              />
            </View>
          </Card>
        </>
      )}
    </ScreenShell>
  );
}
const styles = StyleSheet.create({
  planCard: { borderTopWidth: 5, borderTopColor: "#C8A96B" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  planIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  analyticsIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    ...typeScale.meta,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  plan: { fontSize: 21, fontWeight: "800", color: colors.text },
  heading: { ...typeScale.section, color: colors.text },
  note: { ...typeScale.meta, color: colors.textMuted, lineHeight: 18 },
  section: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  limit: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  limitName: { fontSize: 13, color: colors.text, flex: 1 },
  limitValue: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  fill: { height: 7, borderRadius: 4, backgroundColor: colors.primary },
});
