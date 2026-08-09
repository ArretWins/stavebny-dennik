import React, { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  FilePenLine,
  ReceiptText,
  RadioTower,
  ShieldAlert,
  Users,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  TopBar,
} from "@/components/ui";
import {
  projectControlTower,
  type ControlTowerItem,
  type ControlTowerSeverity,
  type ControlTowerTarget,
} from "@/domain/controlTower";
import {
  projectCostForecast,
  projectFinancialSummary,
} from "@/domain/financialControl";
import { projectProcurementCommitmentCents } from "@/domain/procurement";
import { formatEuroAmount } from "@/domain/receipts";
import { projectScheduleForecast } from "@/domain/scheduleForecast";
import { localDateIso } from "@/domain/ids";
import { t } from "@/i18n";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

const severityColor: Record<ControlTowerSeverity, string> = {
  critical: colors.danger,
  high: colors.warning,
  watch: "#9A6A13",
  clear: colors.primary,
};
const severitySoft: Record<ControlTowerSeverity, string> = {
  critical: "#FCE8E8",
  high: colors.warningSoft,
  watch: "#F7F0DE",
  clear: colors.primarySoft,
};

function itemIcon(item: ControlTowerItem) {
  if (item.target === "financial") return CircleGauge;
  if (item.target === "schedule") return CalendarClock;
  if (item.target === "defects" || item.target === "task_reviews")
    return ShieldAlert;
  if (item.target === "material_requests") return ClipboardList;
  if (item.target === "workers") return Users;
  if (item.target === "receipts") return ReceiptText;
  if (item.target === "rfis") return ClipboardList;
  if (item.target === "tools") return ShieldAlert;
  if (item.target === "timesheet") return CalendarClock;
  if (item.target === "safety_briefings") return ShieldAlert;
  if (item.target === "worker_credentials") return ShieldAlert;
  if (item.target === "site_incidents") return ShieldAlert;
  if (item.target === "material_deliveries") return ClipboardList;
  if (item.target === "material_stock") return ClipboardList;
  if (item.target === "task_materials") return ClipboardList;
  if (item.target === "task_tools") return ShieldAlert;
  if (item.target === "tomorrow_plan") return CalendarClock;
  if (item.target === "checklists") return ClipboardCheck;
  if (item.target === "change_orders") return FilePenLine;
  return CloudOff;
}

function itemDetail(item: ControlTowerItem): string {
  if (item.amountCents !== undefined && item.count !== undefined)
    return t(`controlTower.issue.${item.id}.detailAmountCount`, {
      amount: formatEuroAmount(Math.abs(item.amountCents)),
      count: item.count,
    });
  if (item.amountCents !== undefined)
    return t(`controlTower.issue.${item.id}.detailAmount`, {
      amount: formatEuroAmount(Math.abs(item.amountCents)),
    });
  return t(`controlTower.issue.${item.id}.detail`, {
    count: item.count ?? 1,
  });
}

function IssueRow({
  item,
  onPress,
}: {
  item: ControlTowerItem;
  onPress: () => void;
}) {
  const Icon = itemIcon(item);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(`controlTower.issue.${item.id}.title`)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.issue,
        { borderLeftColor: severityColor[item.severity] },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.issueIcon,
          { backgroundColor: severitySoft[item.severity] },
        ]}
      >
        <Icon color={severityColor[item.severity]} size={23} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.issueTitle}>
          {t(`controlTower.issue.${item.id}.title`)}
        </Text>
        <Text style={styles.issueDetail}>{itemDetail(item)}</Text>
      </View>
      <ChevronRight color={colors.textMuted} size={21} />
    </Pressable>
  );
}

export function ControlTowerScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, refreshProjectData, syncNow } = useApp();
  const today = localDateIso();
  const budget = state.projectBudgets.find(
    (item) => item.projectId === selectedProject?.id,
  );
  const projectSchedule = state.projectSchedules.find(
    (item) => item.projectId === selectedProject?.id,
  );
  const receipts = state.receipts.filter(
    (item) => item.projectId === selectedProject?.id,
  );
  const financial = useMemo(
    () =>
      projectFinancialSummary({
        budget,
        receipts,
        categories: state.receiptCategories,
        changeOrders: state.changeOrders.filter(
          (item) => item.projectId === selectedProject?.id,
        ),
        procurementCommitmentCents: projectProcurementCommitmentCents({
          projectId: selectedProject?.id ?? "",
          requests: state.materialRequests,
          quotes: state.materialSupplierQuotes ?? [],
          receiptLinks: state.receiptRequestLinks,
        }),
      }),
    [
      budget,
      receipts,
      selectedProject?.id,
      state.changeOrders,
      state.materialRequests,
      state.materialSupplierQuotes,
      state.receiptCategories,
      state.receiptRequestLinks,
    ],
  );
  const schedule = useMemo(
    () =>
      projectScheduleForecast({
        projectId: selectedProject?.id ?? "",
        today,
        schedule: projectSchedule,
        tasks: state.siteTasks,
        delays: state.delayEvents,
        materialRequests: state.materialRequests,
        changeOrders: state.changeOrders,
      }),
    [
      projectSchedule,
      selectedProject?.id,
      state.changeOrders,
      state.delayEvents,
      state.materialRequests,
      state.siteTasks,
      today,
    ],
  );
  const cost = useMemo(
    () =>
      projectCostForecast({
        summary: financial,
        budget,
        receipts,
        today,
        scheduleStartDate: projectSchedule?.startDate,
        forecastCompletionDate: schedule.forecastCompletionDate,
      }),
    [
      budget,
      financial,
      projectSchedule?.startDate,
      receipts,
      schedule.forecastCompletionDate,
      today,
    ],
  );
  const tower = useMemo(
    () =>
      projectControlTower({
        projectId: selectedProject?.id ?? "",
        today,
        tasks: state.siteTasks,
        materialRequests: state.materialRequests,
        workers: state.workers,
        receipts: state.receipts,
        checklists: state.projectChecklists,
        changeOrders: state.changeOrders,
        rfis: state.projectRfis,
        tools: state.projectTools,
        workShifts: state.workShifts,
        safetyBriefings: state.safetyBriefings,
        safetyBriefingRecipients: state.safetyBriefingRecipients,
        workerCredentials: state.workerCredentials,
        siteIncidents: state.siteIncidents,
        materialDeliveries: state.materialDeliveries,
        materialDeliveryLines: state.materialDeliveryLines,
        materialStockMovements: state.materialStockMovements,
        taskMaterialRequirements: state.taskMaterialRequirements,
        taskToolRequirements: state.taskToolRequirements,
        diaryApprovals: state.diaryApprovalRequests,
        costForecast: cost,
        scheduleForecast: schedule,
        failedSyncCount: state.outbox.filter((item) => item.status === "failed")
          .length,
      }),
    [
      cost,
      schedule,
      selectedProject?.id,
      state.changeOrders,
      state.materialRequests,
      state.outbox,
      state.projectChecklists,
      state.projectRfis,
      state.projectTools,
      state.receipts,
      state.siteTasks,
      state.workers,
      state.workerCredentials,
      state.siteIncidents,
      state.materialDeliveries,
      state.materialDeliveryLines,
      state.materialStockMovements,
      state.taskMaterialRequirements,
      state.taskToolRequirements,
      state.diaryApprovalRequests,
      today,
    ],
  );
  useEffect(() => {
    void refreshProjectData();
  }, [refreshProjectData, selectedProject?.id]);
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("controlTower.title")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );

  const openTarget = (target: ControlTowerTarget) => {
    if (target === "sync") {
      void syncNow();
      return;
    }
    if (target === "financial") navigation.navigate("FinancialControl");
    else if (target === "schedule") navigation.navigate("ScheduleForecast");
    else if (target === "defects")
      navigation.navigate("Tasks", { kind: "defect" });
    else if (target === "task_reviews") navigation.navigate("Tasks");
    else if (target === "material_requests")
      navigation.navigate("Workforce", { tab: "requests" });
    else if (target === "workers")
      navigation.navigate("Workforce", { tab: "workers" });
    else if (target === "receipts") navigation.navigate("Receipts");
    else if (target === "rfis") navigation.navigate("RfiList");
    else if (target === "tools") navigation.navigate("Tools");
    else if (target === "timesheet") navigation.navigate("Timesheet");
    else if (target === "safety_briefings")
      navigation.navigate("SafetyBriefings");
    else if (target === "worker_credentials")
      navigation.navigate("WorkerCredentials");
    else if (target === "site_incidents") navigation.navigate("SiteIncidents");
    else if (target === "material_deliveries")
      navigation.navigate("MaterialDeliveries");
    else if (target === "material_stock") navigation.navigate("MaterialStock");
    else if (target === "task_materials") navigation.navigate("TaskMaterials");
    else if (target === "task_tools") navigation.navigate("TaskTools");
    else if (target === "tomorrow_plan") navigation.navigate("TomorrowPlan");
    else if (target === "diary_approvals") navigation.navigate("DiaryApprovals");
    else if (target === "checklists") navigation.navigate("Checklists");
    else if (target === "change_orders") navigation.navigate("ChangeOrders");
  };
  return (
    <ScreenShell>
      <TopBar
        title={t("controlTower.title")}
        onBack={() => navigation.goBack()}
      />
      <Card
        style={{
          ...styles.hero,
          borderTopColor: severityColor[tower.severity],
        }}
      >
        <View style={styles.heroHeader}>
          <View
            style={[
              styles.towerIcon,
              { backgroundColor: severitySoft[tower.severity] },
            ]}
          >
            <RadioTower color={severityColor[tower.severity]} size={31} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.kicker}>{selectedProject.name}</Text>
            <Text style={styles.heroTitle}>
              {t(`controlTower.health.${tower.severity}.title`)}
            </Text>
            <Text style={styles.heroHint}>
              {t(`controlTower.health.${tower.severity}.hint`, {
                count: tower.actionCount,
              })}
            </Text>
          </View>
        </View>
        <View style={styles.controlLine}>
          <View style={styles.rail} />
          {tower.signals.map((signal) => (
            <View style={styles.signal} key={signal.key}>
              <View
                style={[
                  styles.signalPoint,
                  {
                    borderColor: severityColor[signal.severity],
                    backgroundColor: severitySoft[signal.severity],
                  },
                ]}
              >
                <View
                  style={[
                    styles.signalCore,
                    { backgroundColor: severityColor[signal.severity] },
                  ]}
                />
              </View>
              <Text style={styles.signalLabel}>
                {t(`controlTower.signal.${signal.key}`)}
              </Text>
              <Text
                style={[
                  styles.signalValue,
                  { color: severityColor[signal.severity] },
                ]}
              >
                {t(`controlTower.severity.${signal.severity}`)}
                {signal.count ? ` · ${signal.count}` : ""}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <PrimaryButton
        title={t("dailyPlan.open")}
        icon={ClipboardCheck}
        onPress={() => navigation.navigate("DailyControlPlan")}
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("controlTower.actNow")}</Text>
        <View
          style={[
            styles.countBadge,
            {
              backgroundColor:
                tower.actionCount > 0
                  ? severitySoft[tower.severity]
                  : colors.primarySoft,
            },
          ]}
        >
          <Text
            style={[
              styles.countText,
              {
                color:
                  tower.actionCount > 0
                    ? severityColor[tower.severity]
                    : colors.primaryDark,
              },
            ]}
          >
            {tower.actionCount}
          </Text>
        </View>
      </View>
      {tower.actions.length ? (
        <View style={styles.issueList}>
          {tower.actions.map((item) => (
            <IssueRow
              item={item}
              key={item.id}
              onPress={() => openTarget(item.target)}
            />
          ))}
        </View>
      ) : (
        <Card style={styles.clearCard}>
          <CheckCircle2 color={colors.primary} size={28} />
          <View style={styles.flex}>
            <Text style={styles.clearTitle}>{t("controlTower.noActions")}</Text>
            <Text style={styles.clearHint}>
              {t("controlTower.noActionsHint")}
            </Text>
          </View>
        </Card>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("controlTower.waiting")}</Text>
        <Text style={styles.sectionMeta}>{tower.waitingCount}</Text>
      </View>
      {tower.waiting.length ? (
        <View style={styles.issueList}>
          {tower.waiting.map((item) => (
            <IssueRow
              item={item}
              key={item.id}
              onPress={() => openTarget(item.target)}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.waitingEmpty}>
          {t("controlTower.waitingEmpty")}
        </Text>
      )}
      <View style={styles.method}>
        <AlertTriangle color={colors.textMuted} size={18} />
        <Text style={styles.methodText}>{t("controlTower.method")}</Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    borderTopWidth: 6,
    paddingTop: spacing.xl,
    gap: spacing.xl,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  towerIcon: {
    width: 58,
    height: 58,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    marginTop: 2,
  },
  heroHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  controlLine: {
    flexDirection: "row",
    position: "relative",
    paddingTop: spacing.xs,
  },
  rail: {
    position: "absolute",
    height: 2,
    backgroundColor: colors.border,
    left: "12%",
    right: "12%",
    top: 15,
  },
  signal: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 2,
  },
  signalPoint: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  signalCore: { width: 8, height: 8, borderRadius: 4 },
  signalLabel: {
    color: colors.text,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  signalValue: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  sectionMeta: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  countBadge: {
    minWidth: 34,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 13, fontWeight: "900" },
  issueList: { gap: spacing.sm },
  issue: {
    minHeight: 84,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 6,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  issueIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  issueTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  issueDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  pressed: { opacity: 0.72 },
  clearCard: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "#B9D2B6",
    backgroundColor: "#FBFEFA",
  },
  clearTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: "800" },
  clearHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  waitingEmpty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing.xs,
  },
  method: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: "#F1EFEA",
    borderRadius: radius.md,
  },
  methodText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
});
