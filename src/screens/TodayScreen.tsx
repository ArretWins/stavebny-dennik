import React, { useEffect, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CloudRain,
  Pause,
  Plus,
  QrCode,
  ReceiptText,
  Images,
  MapPinned,
  Users,
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  RadioTower,
  ChevronRight,
} from "lucide-react-native";
import {
  ScreenShell,
  TopBar,
  Card,
  PrimaryButton,
  WarningActionButton,
  SecondaryButton,
  SyncBanner,
  EmptyState,
  IconButton,
} from "@/components/ui";
import { colors, spacing } from "@/theme/tokens";
import { formatTime } from "@/i18n/format";
import { t } from "@/i18n";
import { weatherLabel } from "@/domain/weather";
import { localDateIso } from "@/domain/ids";
import { useApp } from "@/state/app";
import {
  projectCostForecast,
  projectFinancialSummary,
} from "@/domain/financialControl";
import { projectProcurementCommitmentCents } from "@/domain/procurement";
import { projectScheduleForecast } from "@/domain/scheduleForecast";
import { projectControlTower } from "@/domain/controlTower";

export function TodayScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    pendingCount,
    refreshGallery,
    refreshProjectData,
  } = useApp();
  const today = localDateIso();
  const entries = state.diaryEntries
    .filter(
      (entry) =>
        entry.projectId === selectedProject?.id && entry.logDate === today,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const workers = state.workerCheckins.filter(
    (item) =>
      item.projectId === selectedProject?.id &&
      item.checkedInAt.startsWith(today),
  );
  const failedCount = state.outbox.filter(
    (item) => item.status === "failed",
  ).length;
  const unreadCount = state.notifications.filter((item) => !item.readAt).length;
  const photoCount = state.attachments.filter(
    (item) => item.projectId === selectedProject?.id,
  ).length;
  const planCount = state.projectPlans.filter(
    (item) => item.projectId === selectedProject?.id,
  ).length;
  const openTaskCount = state.siteTasks.filter(
    (item) => item.projectId === selectedProject?.id && item.status !== "done",
  ).length;
  const openDefectCount = state.siteTasks.filter(
    (item) =>
      item.projectId === selectedProject?.id &&
      item.kind === "defect" &&
      item.status !== "done",
  ).length;
  const reviewDefectCount = state.siteTasks.filter(
    (item) =>
      item.projectId === selectedProject?.id &&
      item.kind === "defect" &&
      item.status === "review",
  ).length;
  const projectBudget = state.projectBudgets.find(
    (item) => item.projectId === selectedProject?.id,
  );
  const projectReceipts = state.receipts.filter(
    (item) => item.projectId === selectedProject?.id,
  );
  const financialSummary = useMemo(
    () =>
      projectFinancialSummary({
        budget: projectBudget,
        receipts: projectReceipts,
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
      projectBudget,
      selectedProject?.id,
      state.changeOrders,
      state.materialRequests,
      state.materialSupplierQuotes,
      state.receiptCategories,
      state.receiptRequestLinks,
      projectReceipts,
    ],
  );
  const projectSchedule = state.projectSchedules.find(
    (item) => item.projectId === selectedProject?.id,
  );
  const scheduleSummary = useMemo(
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
  const costForecast = useMemo(
    () =>
      projectCostForecast({
        summary: financialSummary,
        budget: projectBudget,
        receipts: projectReceipts,
        today,
        scheduleStartDate: projectSchedule?.startDate,
        forecastCompletionDate: scheduleSummary.forecastCompletionDate,
      }),
    [
      financialSummary,
      projectBudget,
      projectReceipts,
      projectSchedule?.startDate,
      scheduleSummary.forecastCompletionDate,
      today,
    ],
  );
  const controlTower = useMemo(
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
        costForecast,
        scheduleForecast: scheduleSummary,
        failedSyncCount: failedCount,
      }),
    [
      costForecast,
      failedCount,
      scheduleSummary,
      selectedProject?.id,
      state.changeOrders,
      state.materialRequests,
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
  const visibleControlActionCount = controlTower.actions.filter(
    (item) =>
      ![
        "financial",
        "schedule",
        "tools",
        "task_tools",
        "checklists",
        "change_orders",
      ].includes(item.target),
  ).length;
  useEffect(() => {
    void refreshProjectData();
    void refreshGallery().catch(() => undefined);
  }, [selectedProject?.id]);
  if (!selectedProject)
    return (
      <ScreenShell>
        <EmptyState
          title={t("projects.noProjects")}
          hint={t("projects.noProjectsHint")}
          action={
            <SecondaryButton
              title={t("projects.newProject")}
              onPress={() => navigation.navigate("Projects")}
            />
          }
        />
      </ScreenShell>
    );
  const savedWeather = entries
    .map((entry) => entry.evidence.weather)
    .find((snapshot) => snapshot?.status === "saved");
  const weatherSummary =
    savedWeather?.temperatureC !== undefined
      ? `${savedWeather.temperatureC} °C · ${weatherLabel(savedWeather.weatherCode)}`
      : t("dashboard.weatherEmpty");
  return (
    <ScreenShell>
      <TopBar
        title={t("dashboard.title")}
        right={
          <View>
            <IconButton
              icon={Bell}
              label={t("notifications.title")}
              onPress={() => navigation.navigate("Notifications")}
            />
            {unreadCount ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        }
      />
      <Pressable
        style={styles.selector}
        onPress={() => navigation.navigate("Projects")}
      >
        <CalendarDays color={colors.text} size={21} />
        <View style={styles.flex}>
          <Text style={styles.meta}>{t("dashboard.projectSelector")}</Text>
          <Text style={styles.selectorText} numberOfLines={1}>
            {selectedProject.name}
          </Text>
        </View>
        <ChevronDown color={colors.textMuted} size={20} />
      </Pressable>
      <View style={styles.actions}>
        <PrimaryButton
          title={t("dashboard.addRecord")}
          icon={Plus}
          onPress={() => navigation.navigate("Diary")}
          style={styles.action}
        />
        <WarningActionButton
          title={t("dashboard.reportDelay")}
          icon={Pause}
          onPress={() => navigation.navigate("Delay")}
          style={styles.action}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("controlTower.open")}
        onPress={() => navigation.navigate("ControlTower")}
        style={({ pressed }) => [
          styles.towerCard,
          pressed && styles.towerPressed,
        ]}
      >
        <View style={styles.towerHeader}>
          <View style={styles.towerIcon}>
            <RadioTower color={colors.surface} size={28} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.towerKicker}>
              {t("controlTower.dashboardTitle")}
            </Text>
            <Text style={styles.towerTitle}>
              {t(`controlTower.health.${controlTower.severity}.title`)}
            </Text>
          </View>
          <View
            style={[
              styles.towerCount,
              controlTower.severity === "critical" && styles.towerCountCritical,
            ]}
          >
            <Text style={styles.towerCountText}>
              {visibleControlActionCount}
            </Text>
          </View>
          <ChevronRight color={colors.surface} size={22} />
        </View>
        <View style={styles.towerSignals}>
          {controlTower.signals.map((signal) => (
            <View style={styles.towerSignal} key={signal.key}>
              <View
                style={[
                  styles.towerSignalBar,
                  signal.severity === "critical"
                    ? styles.towerSignalCritical
                    : signal.severity === "high"
                      ? styles.towerSignalHigh
                      : signal.severity === "watch"
                        ? styles.towerSignalWatch
                        : styles.towerSignalClear,
                ]}
              />
              <Text style={styles.towerSignalLabel}>
                {t(`controlTower.signal.${signal.key}`)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={styles.towerHint}>
          {visibleControlActionCount
            ? t("controlTower.dashboardActions", {
                count: visibleControlActionCount,
              })
            : t("controlTower.dashboardClear")}
        </Text>
      </Pressable>
      <Card>
        <Text style={styles.sectionTitle}>{t("dashboard.weatherTitle")}</Text>
        <View style={styles.weatherRow}>
          <CloudRain color={colors.primary} size={38} />
          <View>
            <Text style={styles.weatherValue}>{weatherSummary}</Text>
            <Text style={styles.meta}>
              {savedWeather
                ? t("dashboard.weatherUpdated", {
                    time: formatTime(savedWeather.capturedAt),
                  })
                : t("evidence.weatherPending")}
            </Text>
          </View>
        </View>
      </Card>
      <Card style={styles.galleryCard}>
        <View style={styles.galleryRow}>
          <View style={styles.galleryIcon}>
            <Images color={colors.primary} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("gallery.title")}</Text>
            <Text style={styles.meta}>
              {t("gallery.photoCount", { count: photoCount })} ·{" "}
              {t("gallery.dashboardHint")}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("gallery.open")}
          icon={Images}
          onPress={() => navigation.navigate("Gallery")}
        />
      </Card>
      <Card style={styles.planningCard}>
        <View style={styles.galleryRow}>
          <View style={styles.galleryIcon}>
            <MapPinned color={colors.primary} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("planning.title")}</Text>
            <Text style={styles.meta}>
              {t("planning.planCount", { count: planCount })} ·{" "}
              {t("planning.taskCount", { count: openTaskCount })}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("planning.open")}
          icon={MapPinned}
          onPress={() => navigation.navigate("Plans")}
        />
        <SecondaryButton
          title={t("tomorrowPlan.open")}
          icon={CalendarClock}
          onPress={() => navigation.navigate("TomorrowPlan")}
        />
      </Card>
      <Card style={styles.defectsCard}>
        <View style={styles.galleryRow}>
          <View style={styles.defectIcon}>
            <AlertTriangle color={colors.warning} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>
              {t("siteTasks.defectsTitle")}
            </Text>
            <Text style={styles.meta}>
              {t("siteTasks.openDefects", { count: openDefectCount })} ·{" "}
              {t("siteTasks.reviewDefects", { count: reviewDefectCount })}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("siteTasks.defectsTitle")}
          icon={AlertTriangle}
          onPress={() => navigation.navigate("Tasks", { kind: "defect" })}
        />
        <WarningActionButton
          title={t("siteTasks.addDefect")}
          icon={Plus}
          onPress={() =>
            navigation.navigate("TaskEditor", { defaultKind: "defect" })
          }
        />
      </Card>
      <Card style={styles.weeklyCard}>
        <View style={styles.galleryRow}>
          <View style={styles.weeklyIcon}>
            <CalendarRange color={colors.primaryDark} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("weeklyReport.title")}</Text>
            <Text style={styles.meta}>
              {state.weeklyReports.some(
                (item) =>
                  item.projectId === selectedProject.id &&
                  item.status === "draft",
              )
                ? t("weeklyReport.saved")
                : t("weeklyReport.open")}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("weeklyReport.open")}
          icon={CalendarRange}
          onPress={() => navigation.navigate("WeeklyReport")}
        />
      </Card>
      <Card>
        <Text style={styles.sectionTitle}>{t("dashboard.workersTitle")}</Text>
        <View style={styles.workerRow}>
          <Users color={colors.primary} size={34} />
          <View style={styles.flex}>
            <Text style={styles.workerCount}>
              {t("dashboard.workersCount", { count: workers.length })}
            </Text>
            <Text style={styles.meta}>
              {workers.length
                ? workers.map((worker) => worker.workerName).join(", ")
                : t("dashboard.workersEmpty")}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("workerManagement.title")}
          icon={Users}
          onPress={() => navigation.navigate("Workforce")}
        />
        <SecondaryButton
          title={t("dashboard.openCheckin")}
          icon={QrCode}
          onPress={() => navigation.navigate("Checkin")}
        />
      </Card>
      <Card>
        <Text style={styles.sectionTitle}>{t("receipts.title")}</Text>
        <SecondaryButton
          title={t("receipts.add")}
          icon={ReceiptText}
          onPress={() => navigation.navigate("ReceiptEditor")}
        />
        <SecondaryButton
          title={t("receipts.title")}
          onPress={() => navigation.navigate("Receipts")}
        />
      </Card>
      <SyncBanner
        count={pendingCount}
        failedCount={failedCount}
        onPress={() => navigation.navigate("SyncCenter")}
      />
      {entries.length ? (
        <>
          <Text style={styles.sectionTitle}>{t("dashboard.recordsTitle")}</Text>
          {entries.map((entry) => (
            <Card key={entry.id}>
              <Text style={styles.recordTime}>
                {formatTime(entry.createdAt)}
              </Text>
              <Text style={styles.recordText}>{entry.workDescription}</Text>
              <Text style={styles.meta}>
                {t("diary.workers")}: {entry.workerCount}
                {entry.lockedAt ? ` · ${t("diary.locked")}` : ""}
              </Text>
              {entry.lockedAt ? (
                <SecondaryButton
                  title={t("diary.correction")}
                  onPress={() =>
                    navigation.navigate("Diary", { correctionOfId: entry.id })
                  }
                />
              ) : (
                <SecondaryButton
                  title={t("diary.edit")}
                  onPress={() =>
                    navigation.navigate("Diary", { editId: entry.id })
                  }
                />
              )}
            </Card>
          ))}
        </>
      ) : (
        <Card>
          <EmptyState
            title={t("dashboard.noRecords")}
            action={
              <SecondaryButton
                title={t("dashboard.addRecord")}
                icon={Plus}
                onPress={() => navigation.navigate("Diary")}
              />
            }
          />
        </Card>
      )}
      <SecondaryButton
        title={t("reports.title")}
        onPress={() => navigation.navigate("Reports")}
      />
    </ScreenShell>
  );
}
const styles = StyleSheet.create({
  selector: {
    minHeight: 60,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  selectorText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { flex: 1, minHeight: 112, borderRadius: spacing.md },
  towerCard: {
    backgroundColor: "#173F35",
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  towerPressed: { opacity: 0.78 },
  towerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  towerIcon: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  towerKicker: {
    color: "#BFD7CC",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  towerTitle: {
    color: colors.surface,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    marginTop: 2,
  },
  towerCount: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  towerCountCritical: { backgroundColor: colors.danger },
  towerCountText: { color: colors.surface, fontSize: 14, fontWeight: "900" },
  towerSignals: { flexDirection: "row", gap: spacing.sm },
  towerSignal: { flex: 1, gap: 5 },
  towerSignalBar: { height: 5, borderRadius: 3 },
  towerSignalCritical: { backgroundColor: "#FF7B7B" },
  towerSignalHigh: { backgroundColor: "#FFB45D" },
  towerSignalWatch: { backgroundColor: "#E9D49B" },
  towerSignalClear: { backgroundColor: "#75C985" },
  towerSignalLabel: {
    color: "#DDEBE4",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  towerHint: { color: "#BFD7CC", fontSize: 11, lineHeight: 16 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  weatherValue: { color: colors.text, fontSize: 14, fontWeight: "600" },
  workerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  workerCount: { color: colors.text, fontSize: 15, fontWeight: "700" },
  recordTime: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  recordText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  notificationBadge: {
    position: "absolute",
    right: -2,
    top: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: {
    color: colors.surface,
    fontSize: 10,
    fontWeight: "800",
  },
  galleryCard: { borderTopWidth: 4, borderTopColor: colors.warning },
  planningCard: { borderTopWidth: 4, borderTopColor: colors.primary },
  defectsCard: { borderTopWidth: 4, borderTopColor: colors.warning },
  checklistsCard: { borderTopWidth: 4, borderTopColor: colors.primary },
  changeOrdersCard: { borderTopWidth: 4, borderTopColor: "#C8A96B" },
  financialCard: { borderTopWidth: 4, borderTopColor: colors.primaryDark },
  scheduleCard: { borderTopWidth: 4, borderTopColor: "#C8A96B" },
  weeklyCard: { borderTopWidth: 4, borderTopColor: "#173F35" },
  toolsCard: { borderTopWidth: 4, borderTopColor: "#E46F2E" },
  galleryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  galleryIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  defectIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.warningSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  changeOrderIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#EFE6D2",
    alignItems: "center",
    justifyContent: "center",
  },
  financialIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#E8EFEA",
    alignItems: "center",
    justifyContent: "center",
  },
  financialSignal: {
    fontSize: 11,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  financialSignalDanger: { color: colors.danger },
  financialSignalSafe: { color: colors.primaryDark },
  scheduleIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#F4ECD9",
    alignItems: "center",
    justifyContent: "center",
  },
  weeklyIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#E7EEE9",
    alignItems: "center",
    justifyContent: "center",
  },
  toolsIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#FFF0E6",
    alignItems: "center",
    justifyContent: "center",
  },
  closureCard: {
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    backgroundColor: "#FBFDF9",
  },
  closureHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  closureIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  closureScore: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  sealMark: {
    minWidth: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sealVersion: {
    color: colors.primaryDark,
    fontSize: 9,
    fontWeight: "900",
  },
  closureChecks: { gap: spacing.sm },
  closureRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closureLabel: { flex: 1, color: colors.text, fontSize: 12 },
  closureStatus: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "800",
  },
  closureStatusWarning: { color: colors.warning },
  closureConfirmation: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  closureSheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
  },
  closureSheetContent: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sheetSeal: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetEyebrow: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
  },
  sheetLead: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  snapshotRow: {
    minHeight: 66,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: "#173F35",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  snapshotNumber: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  snapshotLabel: {
    flex: 1,
    color: "#DDEBE4",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  snapshotDivider: {
    width: 1,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  warningLedger: {
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderRadius: 10,
    backgroundColor: colors.warningSoft,
    gap: spacing.sm,
  },
  warningLedgerTitle: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  warningLedgerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  warningLedgerText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
  },
  confirmationBox: {
    minHeight: 76,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  confirmationBoxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.textMuted,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  confirmationText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  closureError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  immutableHint: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    textAlign: "center",
  },
});
