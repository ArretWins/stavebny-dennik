import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  CircleGauge,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  FilePenLine,
  History,
  Hourglass,
  LockKeyhole,
  ReceiptText,
  ShieldAlert,
  Users,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TopBar,
} from "@/components/ui";
import {
  projectControlTower,
  type ControlTowerItem,
  type ControlTowerTarget,
} from "@/domain/controlTower";
import { morningControlBriefing } from "@/domain/dailyControlPlan";
import {
  projectCostForecast,
  projectFinancialSummary,
} from "@/domain/financialControl";
import { projectProcurementCommitmentCents } from "@/domain/procurement";
import { localDateIso } from "@/domain/ids";
import { formatEuroAmount } from "@/domain/receipts";
import { projectScheduleForecast } from "@/domain/scheduleForecast";
import type { DailyControlAction } from "@/domain/types";
import { t } from "@/i18n";
import { formatDate, formatDateTime } from "@/i18n/format";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

const severityColor = {
  critical: colors.danger,
  high: colors.warning,
  watch: "#9A6A13",
} as const;
const severitySoft = {
  critical: "#FCE8E8",
  high: colors.warningSoft,
  watch: "#F7F0DE",
} as const;

function actionIcon(action: DailyControlAction) {
  if (action.target === "financial") return CircleGauge;
  if (action.target === "schedule") return CalendarClock;
  if (action.target === "defects" || action.target === "task_reviews")
    return ShieldAlert;
  if (action.target === "material_requests") return ClipboardList;
  if (action.target === "workers") return Users;
  if (action.target === "receipts") return ReceiptText;
  if (action.target === "rfis") return ClipboardList;
  if (action.target === "tools") return ShieldAlert;
  if (action.target === "timesheet") return CalendarClock;
  if (action.target === "safety_briefings") return ShieldAlert;
  if (action.target === "worker_credentials") return ShieldAlert;
  if (action.target === "site_incidents") return ShieldAlert;
  if (action.target === "material_deliveries") return ClipboardList;
  if (action.target === "material_stock") return ClipboardList;
  if (action.target === "task_materials") return ClipboardList;
  if (action.target === "task_tools") return ShieldAlert;
  if (action.target === "tomorrow_plan") return CalendarClock;
  if (action.target === "diary_approvals") return ClipboardCheck;
  if (action.target === "checklists") return ClipboardCheck;
  if (action.target === "change_orders") return FilePenLine;
  return CloudOff;
}

function controlItemDetail(item: {
  issue: string;
  count?: number;
  amountCents?: number;
}): string {
  if (item.amountCents !== undefined && item.count !== undefined)
    return t(`controlTower.issue.${item.issue}.detailAmountCount`, {
      amount: formatEuroAmount(Math.abs(item.amountCents)),
      count: item.count,
    });
  if (item.amountCents !== undefined)
    return t(`controlTower.issue.${item.issue}.detailAmount`, {
      amount: formatEuroAmount(Math.abs(item.amountCents)),
    });
  return t(`controlTower.issue.${item.issue}.detail`, {
    count: item.count ?? 1,
  });
}

function OpenActionCard({
  action,
  ageDays,
  expanded,
  resolution,
  busy,
  onExpand,
  onResolution,
  onOpen,
  onResolve,
}: {
  action: DailyControlAction;
  ageDays?: number;
  expanded: boolean;
  resolution: string;
  busy: boolean;
  onExpand: () => void;
  onResolution: (value: string) => void;
  onOpen: () => void;
  onResolve: () => void;
}) {
  const Icon = actionIcon(action);
  return (
    <Card
      style={{
        ...styles.actionCard,
        borderLeftColor: severityColor[action.severity],
      }}
    >
      <View style={styles.actionHeader}>
        <View
          style={[
            styles.actionIcon,
            { backgroundColor: severitySoft[action.severity] },
          ]}
        >
          <Icon color={severityColor[action.severity]} size={25} />
        </View>
        <View style={styles.flex}>
          <View style={styles.actionTitleRow}>
            <Text style={styles.actionTitle}>
              {t(`controlTower.issue.${action.issue}.title`)}
            </Text>
            {ageDays ? (
              <View style={styles.ageBadge}>
                <Text style={styles.ageBadgeText}>
                  {t("dailyPlan.ageDays", { count: ageDays })}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.actionDetail}>{controlItemDetail(action)}</Text>
        </View>
      </View>
      {expanded ? (
        <View style={styles.resolvePanel}>
          <TextArea
            label={t("dailyPlan.resolution")}
            value={resolution}
            onChangeText={onResolution}
            placeholder={t("dailyPlan.resolutionPlaceholder")}
            maxLength={500}
          />
          <Text style={styles.confirmHint}>{t("dailyPlan.confirmHint")}</Text>
          <PrimaryButton
            title={busy ? t("app.loading") : t("dailyPlan.resolve")}
            icon={Check}
            disabled={busy || resolution.trim().length < 3}
            onPress={onResolve}
          />
          <SecondaryButton
            title={t("dailyPlan.cancelResolve")}
            onPress={onExpand}
          />
        </View>
      ) : (
        <View style={styles.actionButtons}>
          <SecondaryButton
            title={t("dailyPlan.openSource")}
            onPress={onOpen}
            style={styles.flex}
          />
          <PrimaryButton
            title={t("dailyPlan.recordDecision")}
            icon={Check}
            onPress={onExpand}
            style={styles.flex}
          />
        </View>
      )}
    </Card>
  );
}

function WaitingCard({
  item,
  onOpen,
}: {
  item: ControlTowerItem;
  onOpen: () => void;
}) {
  return (
    <Card style={styles.waitingCard}>
      <View style={styles.actionHeader}>
        <View style={styles.waitingIcon}>
          <Hourglass color="#72531B" size={24} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.actionTitle}>
            {t(`controlTower.issue.${item.id}.title`)}
          </Text>
          <Text style={styles.actionDetail}>
            {controlItemDetail({ ...item, issue: item.id })}
          </Text>
        </View>
      </View>
      <SecondaryButton title={t("dailyPlan.openWaiting")} onPress={onOpen} />
    </Card>
  );
}

function ResolvedActionCard({ action }: { action: DailyControlAction }) {
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyRail}>
        <View style={styles.historyPoint}>
          <CheckCircle2 color={colors.primary} size={17} />
        </View>
        <View style={styles.historyLine} />
      </View>
      <View style={styles.historyContent}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>
            {t(`controlTower.issue.${action.issue}.title`)}
          </Text>
          <LockKeyhole color={colors.textMuted} size={15} />
        </View>
        <Text style={styles.historyMeta}>
          {formatDate(action.actionDate)}
          {action.resolvedAt ? ` · ${formatDateTime(action.resolvedAt)}` : ""}
          {action.resolvedBy ? ` · ${t("dailyPlan.resolvedByForeman")}` : ""}
        </Text>
        <Text style={styles.historyResolution}>{action.resolution}</Text>
      </View>
    </View>
  );
}

export function DailyControlPlanScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    prepareDailyControlPlan,
    resolveDailyControlAction,
    syncNow,
  } = useApp();
  const today = localDateIso();
  const [expandedId, setExpandedId] = useState<string>();
  const [resolution, setResolution] = useState("");
  const [busyId, setBusyId] = useState<string>();
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
    if (!selectedProject) return;
    void prepareDailyControlPlan(tower.actions, today);
  }, [prepareDailyControlPlan, selectedProject?.id, today, tower.actions]);

  const briefing = useMemo(
    () =>
      selectedProject
        ? morningControlBriefing({
            actions: state.dailyControlActions,
            waiting: tower.waiting,
            projectId: selectedProject.id,
            today,
          })
        : {
            carriedOpen: [],
            todayOpen: [],
            resolvedToday: [],
            waiting: [],
            openCount: 0,
            handledCount: 0,
            totalCount: 0,
          },
    [selectedProject?.id, state.dailyControlActions, today, tower.waiting],
  );
  const priorHistory = useMemo(() => {
    const resolvedTodayIds = new Set(
      briefing.resolvedToday.map((item) => item.id),
    );
    return state.dailyControlActions
      .filter(
        (item) =>
          item.projectId === selectedProject?.id &&
          item.status === "resolved" &&
          !resolvedTodayIds.has(item.id),
      )
      .sort((left, right) =>
        (right.resolvedAt ?? "").localeCompare(left.resolvedAt ?? ""),
      )
      .slice(0, 30);
  }, [briefing.resolvedToday, selectedProject?.id, state.dailyControlActions]);
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("dailyPlan.title")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );

  const openTarget = (target: ControlTowerTarget | string) => {
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
  const confirmResolution = (action: DailyControlAction) => {
    Alert.alert(t("dailyPlan.confirmTitle"), t("dailyPlan.confirmBody"), [
      { text: t("app.cancel"), style: "cancel" },
      {
        text: t("dailyPlan.confirm"),
        onPress: () => {
          setBusyId(action.id);
          void resolveDailyControlAction(action.id, resolution)
            .then(() => {
              setExpandedId(undefined);
              setResolution("");
            })
            .catch(() => Alert.alert(t("errors.generic")))
            .finally(() => setBusyId(undefined));
        },
      },
    ]);
  };
  const ratio = briefing.totalCount
    ? briefing.handledCount / briefing.totalCount
    : 1;
  return (
    <ScreenShell>
      <TopBar title={t("dailyPlan.title")} onBack={() => navigation.goBack()} />
      <Card style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <View style={styles.clipboardIcon}>
            <ClipboardCheck color={colors.primaryDark} size={31} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.kicker}>
              {formatDate(today)} · {selectedProject.name}
            </Text>
            <Text style={styles.progressTitle}>
              {briefing.openCount
                ? t("dailyPlan.progressOpen", { count: briefing.openCount })
                : t("dailyPlan.progressDone")}
            </Text>
          </View>
          <Text style={styles.fraction}>
            {briefing.handledCount}/{briefing.totalCount}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
        </View>
        <Text style={styles.progressHint}>{t("dailyPlan.progressHint")}</Text>
      </Card>

      <View style={styles.briefingStrip}>
        <View style={styles.briefingMetric}>
          <Text style={[styles.briefingValue, styles.carriedValue]}>
            {briefing.carriedOpen.length}
          </Text>
          <Text style={styles.briefingLabel}>
            {t("dailyPlan.carriedShort")}
          </Text>
        </View>
        <View style={styles.briefingDivider} />
        <View style={styles.briefingMetric}>
          <Text style={styles.briefingValue}>{briefing.todayOpen.length}</Text>
          <Text style={styles.briefingLabel}>{t("dailyPlan.newShort")}</Text>
        </View>
        <View style={styles.briefingDivider} />
        <View style={styles.briefingMetric}>
          <Text style={[styles.briefingValue, styles.waitingValue]}>
            {briefing.waiting.length}
          </Text>
          <Text style={styles.briefingLabel}>
            {t("dailyPlan.waitingShort")}
          </Text>
        </View>
      </View>

      {briefing.carriedOpen.length ? (
        <>
          <View style={styles.sectionHeader}>
            <View style={styles.historyLabel}>
              <History color={colors.danger} size={21} />
              <Text style={styles.sectionTitle}>{t("dailyPlan.carried")}</Text>
            </View>
            <Text style={styles.sectionCount}>
              {briefing.carriedOpen.length}
            </Text>
          </View>
          <Text style={styles.sectionHint}>{t("dailyPlan.carriedHint")}</Text>
          {briefing.carriedOpen.map(({ action, ageDays }) => (
            <OpenActionCard
              action={action}
              ageDays={ageDays}
              key={action.id}
              expanded={expandedId === action.id}
              resolution={expandedId === action.id ? resolution : ""}
              busy={busyId === action.id}
              onExpand={() => {
                setExpandedId((current) =>
                  current === action.id ? undefined : action.id,
                );
                setResolution("");
              }}
              onResolution={setResolution}
              onOpen={() => openTarget(action.target)}
              onResolve={() => confirmResolution(action)}
            />
          ))}
        </>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("dailyPlan.todayNew")}</Text>
        <Text style={styles.sectionCount}>{briefing.todayOpen.length}</Text>
      </View>
      {briefing.todayOpen.map((action) => (
        <OpenActionCard
          action={action}
          key={action.id}
          expanded={expandedId === action.id}
          resolution={expandedId === action.id ? resolution : ""}
          busy={busyId === action.id}
          onExpand={() => {
            setExpandedId((current) =>
              current === action.id ? undefined : action.id,
            );
            setResolution("");
          }}
          onResolution={setResolution}
          onOpen={() => openTarget(action.target)}
          onResolve={() => confirmResolution(action)}
        />
      ))}
      {!briefing.openCount ? (
        <Card style={styles.doneCard}>
          <CheckCircle2 color={colors.primary} size={28} />
          <View style={styles.flex}>
            <Text style={styles.doneTitle}>{t("dailyPlan.noOpen")}</Text>
            <Text style={styles.doneHint}>{t("dailyPlan.noOpenHint")}</Text>
          </View>
        </Card>
      ) : null}

      <View style={styles.sectionHeader}>
        <View style={styles.historyLabel}>
          <Hourglass color="#72531B" size={21} />
          <Text style={styles.sectionTitle}>{t("dailyPlan.waiting")}</Text>
        </View>
        <Text style={styles.sectionCount}>{briefing.waiting.length}</Text>
      </View>
      {briefing.waiting.map((item) => (
        <WaitingCard
          item={item}
          key={item.id}
          onOpen={() => openTarget(item.target)}
        />
      ))}
      {!briefing.waiting.length ? (
        <Text style={styles.emptyHistory}>{t("dailyPlan.waitingEmpty")}</Text>
      ) : null}

      <View style={styles.sectionHeader}>
        <View style={styles.historyLabel}>
          <History color={colors.text} size={21} />
          <Text style={styles.sectionTitle}>{t("dailyPlan.history")}</Text>
        </View>
        <Text style={styles.sectionCount}>
          {briefing.resolvedToday.length + priorHistory.length}
        </Text>
      </View>
      {[...briefing.resolvedToday, ...priorHistory].map((action) => (
        <ResolvedActionCard action={action} key={action.id} />
      ))}
      {!briefing.resolvedToday.length && !priorHistory.length ? (
        <Text style={styles.emptyHistory}>{t("dailyPlan.historyEmpty")}</Text>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progressCard: { borderTopWidth: 6, borderTopColor: "#173F35" },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  clipboardIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  progressTitle: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
    marginTop: 2,
  },
  fraction: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "#E4E1DB",
    overflow: "hidden",
  },
  progressFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  progressHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  briefingStrip: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#173F35",
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  briefingMetric: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  briefingValue: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  carriedValue: { color: "#FFB5A9" },
  waitingValue: { color: "#F4D38A" },
  briefingLabel: {
    color: "#D7E5E0",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase",
  },
  briefingDivider: {
    width: 1,
    marginVertical: 4,
    backgroundColor: "#467064",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: "900" },
  sectionCount: { color: colors.textMuted, fontSize: 13, fontWeight: "900" },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -spacing.sm,
  },
  actionCard: { borderLeftWidth: 6 },
  actionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  actionTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  ageBadge: {
    borderRadius: 999,
    backgroundColor: "#FCE8E8",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ageBadgeText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  actionDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  waitingCard: {
    borderColor: "#D9C79F",
    backgroundColor: "#FFFCF5",
  },
  waitingIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#F7F0DE",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtons: { flexDirection: "row", gap: spacing.sm },
  resolvePanel: {
    backgroundColor: "#F5F3EE",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  confirmHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: "#B9D2B6",
    backgroundColor: "#FBFEFA",
  },
  doneTitle: { color: colors.primaryDark, fontSize: 15, fontWeight: "800" },
  doneHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  historyLabel: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  historyRow: { flexDirection: "row", gap: spacing.md },
  historyRail: { width: 30, alignItems: "center" },
  historyPoint: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  historyLine: {
    width: 2,
    flex: 1,
    minHeight: 48,
    backgroundColor: "#B9D2B6",
  },
  historyContent: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.lg,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  historyTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  historyMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  historyResolution: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  emptyHistory: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
