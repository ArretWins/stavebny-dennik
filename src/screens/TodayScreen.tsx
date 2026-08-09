import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CloudRain,
  Pause,
  Plus,
  QrCode,
  ReceiptText,
  Images,
  MapPinned,
  Users,
  AlertTriangle,
  ShieldCheck,
  FilePenLine,
  CircleGauge,
  CalendarClock,
  CalendarRange,
  RadioTower,
  ChevronRight,
  LockKeyhole,
  X,
  Hammer,
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
  TextArea,
} from "@/components/ui";
import { colors, spacing } from "@/theme/tokens";
import { formatTime } from "@/i18n/format";
import { t } from "@/i18n";
import { weatherLabel } from "@/domain/weather";
import {
  dayClosureStatus as getDayClosureStatus,
  summarizeDayClosure,
} from "@/domain/dayClosure";
import { localDateIso } from "@/domain/ids";
import { useApp } from "@/state/app";
import {
  projectCostForecast,
  projectFinancialSummary,
} from "@/domain/financialControl";
import { projectProcurementCommitmentCents } from "@/domain/procurement";
import { formatEuroAmount } from "@/domain/receipts";
import { projectScheduleForecast } from "@/domain/scheduleForecast";
import { projectControlTower } from "@/domain/controlTower";
import { syncDayClosureReminder } from "@/services/pushNotifications";

export function TodayScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    pendingCount,
    refreshGallery,
    refreshProjectData,
    confirmDayClosure,
  } = useApp();
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureConfirmed, setClosureConfirmed] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [closureError, setClosureError] = useState("");
  const [closingDay, setClosingDay] = useState(false);
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
  const checklistCount = state.projectChecklists.filter(
    (item) => item.projectId === selectedProject?.id,
  ).length;
  const issuedToolCount = state.projectTools.filter(
    (item) =>
      item.projectId === selectedProject?.id && item.status === "issued",
  ).length;
  const availableToolCount = state.projectTools.filter(
    (item) =>
      item.projectId === selectedProject?.id && item.status === "available",
  ).length;
  const toolAttentionCount = state.projectTools.filter(
    (item) =>
      item.projectId === selectedProject?.id &&
      (item.status === "maintenance" ||
        item.status === "lost" ||
        (item.status === "issued" &&
          !!item.expectedReturnDate &&
          item.expectedReturnDate < today)),
  ).length;
  const draftChecklistCount = state.projectChecklists.filter(
    (item) => item.projectId === selectedProject?.id && item.status === "draft",
  ).length;
  const pendingChangeOrderCount = state.changeOrders.filter(
    (item) =>
      item.projectId === selectedProject?.id &&
      item.status === "pending_client",
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
  const dayClosure = useMemo(
    () =>
      selectedProject
        ? summarizeDayClosure(state, selectedProject.id, today)
        : undefined,
    [selectedProject?.id, state, today],
  );
  const closureStatus = useMemo(
    () =>
      selectedProject
        ? getDayClosureStatus(state, selectedProject.id, today)
        : undefined,
    [selectedProject?.id, state, today],
  );
  useEffect(() => {
    if (!selectedProject) return;
    void syncDayClosureReminder({
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      logDate: today,
      isClosed: Boolean(closureStatus?.latest) && !closureStatus?.canConfirm,
    }).catch(() => undefined);
  }, [
    closureStatus?.canConfirm,
    closureStatus?.latest?.id,
    selectedProject?.id,
    selectedProject?.name,
    today,
  ]);
  const openClosureConfirmation = () => {
    const newestUnsealedEntry = entries.find((entry) =>
      closureStatus?.unsealedEntryIds.includes(entry.id),
    );
    setClosureConfirmed(false);
    setCorrectionReason(newestUnsealedEntry?.correctionReason ?? "");
    setClosureError("");
    setClosureOpen(true);
  };
  const closeDay = async () => {
    setClosureError("");
    setClosingDay(true);
    try {
      await confirmDayClosure({
        logDate: today,
        confirmed: closureConfirmed,
        correctionReason,
      });
      setClosureOpen(false);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setClosureError(
        code === "CONFIRMATION_REQUIRED"
          ? t("dayClosure.confirmationRequired")
          : code === "CORRECTION_REASON_REQUIRED"
            ? t("dayClosure.correctionReasonRequired")
            : code === "DIARY_REQUIRED"
              ? t("dayClosure.diaryRequired")
              : t("errors.generic"),
      );
    } finally {
      setClosingDay(false);
    }
  };
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
              {controlTower.actionCount}
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
          {controlTower.actionCount
            ? t("controlTower.dashboardActions", {
                count: controlTower.actionCount,
              })
            : t("controlTower.dashboardClear")}
        </Text>
      </Pressable>
      {dayClosure ? (
        <Card style={styles.closureCard}>
          <View style={styles.closureHeader}>
            <View style={styles.closureIcon}>
              <ClipboardCheck color={colors.primaryDark} size={27} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>{t("dayClosure.title")}</Text>
              <Text style={styles.meta}>
                {closureStatus?.latest && !closureStatus.canConfirm
                  ? t("dayClosure.sealedAt", {
                      time: formatTime(closureStatus.latest.confirmedAt),
                      version: closureStatus.latest.version,
                    })
                  : closureStatus?.latest
                    ? t("dayClosure.correctionPending")
                    : dayClosure.ready
                      ? t("dayClosure.ready")
                      : t("dayClosure.needsAttention")}
              </Text>
            </View>
            {closureStatus?.latest && !closureStatus.canConfirm ? (
              <View style={styles.sealMark}>
                <LockKeyhole color={colors.primaryDark} size={18} />
                <Text style={styles.sealVersion}>
                  v{closureStatus.latest.version}
                </Text>
              </View>
            ) : (
              <Text style={styles.closureScore}>
                {dayClosure.completedCount}/{dayClosure.totalCount}
              </Text>
            )}
          </View>
          <View style={styles.closureChecks}>
            {dayClosure.checks.map((check) => (
              <View style={styles.closureRow} key={check.key}>
                {check.complete ? (
                  <CheckCircle2 color={colors.primary} size={19} />
                ) : (
                  <AlertTriangle color={colors.warning} size={19} />
                )}
                <Text style={styles.closureLabel}>
                  {t(`dayClosure.checks.${check.key}`)}
                </Text>
                <Text
                  style={[
                    styles.closureStatus,
                    !check.complete && styles.closureStatusWarning,
                  ]}
                >
                  {t(
                    check.complete
                      ? "dayClosure.complete"
                      : "dayClosure.attention",
                  )}
                </Text>
              </View>
            ))}
          </View>
          <PrimaryButton
            title={
              closureStatus?.latest && !closureStatus.canConfirm
                ? t("dayClosure.correction")
                : closureStatus?.latest
                  ? t("dayClosure.confirmCorrection")
                  : entries.length
                    ? t("dayClosure.closeDay")
                    : t("dayClosure.draft")
            }
            icon={
              closureStatus?.latest && !closureStatus.canConfirm
                ? FilePenLine
                : LockKeyhole
            }
            onPress={() => {
              const latest = entries[0];
              if (closureStatus?.latest && !closureStatus.canConfirm) {
                navigation.navigate("Diary", {
                  correctionOfId: latest?.id,
                  draft: dayClosure.draft,
                });
                return;
              }
              if (entries.length) {
                openClosureConfirmation();
                return;
              }
              navigation.navigate("DiaryDraftReview");
            }}
          />
          <Text style={styles.closureConfirmation}>
            {closureStatus?.latest && !closureStatus.canConfirm
              ? t("dayClosure.sealedHint", {
                  hash: closureStatus.latest.contentHash.slice(0, 12),
                })
              : t("dayClosure.confirmation")}
          </Text>
        </Card>
      ) : null}
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
      <Card style={styles.checklistsCard}>
        <View style={styles.galleryRow}>
          <View style={styles.galleryIcon}>
            <ShieldCheck color={colors.primary} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("checklists.title")}</Text>
            <Text style={styles.meta}>
              {t("checklists.history")}: {checklistCount} ·{" "}
              {t("checklists.status.draft")}: {draftChecklistCount}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("checklists.title")}
          icon={ShieldCheck}
          onPress={() => navigation.navigate("Checklists")}
        />
      </Card>
      <Card style={styles.changeOrdersCard}>
        <View style={styles.galleryRow}>
          <View style={styles.changeOrderIcon}>
            <FilePenLine color={colors.primaryDark} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("changeOrders.title")}</Text>
            <Text style={styles.meta}>
              {t("changeOrders.status.pending_client")}:{" "}
              {pendingChangeOrderCount}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("changeOrders.title")}
          icon={FilePenLine}
          onPress={() => navigation.navigate("ChangeOrders")}
        />
      </Card>
      <Card style={styles.financialCard}>
        <View style={styles.galleryRow}>
          <View style={styles.financialIcon}>
            <CircleGauge
              color={
                financialSummary.health === "over"
                  ? colors.danger
                  : financialSummary.health === "watch"
                    ? colors.warning
                    : colors.primaryDark
              }
              size={30}
            />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("financial.title")}</Text>
            <Text style={styles.meta}>
              {projectBudget
                ? costForecast.forecastFinalCostCents !== undefined
                  ? `${t("financial.finalCostForecast")}: ${formatEuroAmount(
                      costForecast.forecastFinalCostCents,
                    )}`
                  : t("financial.forecastUnavailable")
                : t("financial.setupTitle")}
            </Text>
            {costForecast.projectedVarianceCents !== undefined ? (
              <Text
                style={[
                  styles.financialSignal,
                  costForecast.projectedVarianceCents > 0
                    ? styles.financialSignalDanger
                    : styles.financialSignalSafe,
                ]}
              >
                {costForecast.projectedVarianceCents > 0
                  ? t("financial.todayOverrun", {
                      amount: formatEuroAmount(
                        costForecast.projectedVarianceCents,
                      ),
                    })
                  : t("financial.todayWithin", {
                      amount: formatEuroAmount(
                        Math.abs(costForecast.projectedVarianceCents),
                      ),
                    })}
              </Text>
            ) : null}
          </View>
        </View>
        <SecondaryButton
          title={t("financial.open")}
          icon={CircleGauge}
          onPress={() => navigation.navigate("FinancialControl")}
        />
      </Card>
      <Card style={styles.scheduleCard}>
        <View style={styles.galleryRow}>
          <View style={styles.scheduleIcon}>
            <CalendarClock
              color={
                scheduleSummary.risk === "critical"
                  ? colors.danger
                  : scheduleSummary.risk === "high" ||
                      scheduleSummary.risk === "watch"
                    ? colors.warning
                    : colors.primaryDark
              }
              size={30}
            />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>
              {t("scheduleForecast.title")}
            </Text>
            <Text style={styles.meta}>
              {projectSchedule
                ? `${t("scheduleForecast.overdue")}: ${
                    scheduleSummary.overdueTaskCount
                  } · ${t("scheduleForecast.blocked")}: ${
                    scheduleSummary.blockedTaskCount
                  }`
                : t("scheduleForecast.setupTitle")}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("scheduleForecast.open")}
          icon={CalendarClock}
          onPress={() => navigation.navigate("ScheduleForecast")}
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
      <Card style={styles.toolsCard}>
        <View style={styles.galleryRow}>
          <View style={styles.toolsIcon}>
            <Hammer color="#E46F2E" size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("tools.title")}</Text>
            <Text style={styles.meta}>
              {t("tools.metricAvailable")}: {availableToolCount}
              {" · "}
              {t("tools.metricIssued")}: {issuedToolCount}
              {" · "}
              {t("tools.metricAttention")}: {toolAttentionCount}
            </Text>
          </View>
        </View>
        <SecondaryButton
          title={t("tools.title")}
          icon={Hammer}
          onPress={() => navigation.navigate("Tools")}
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
      <Modal
        animationType="fade"
        onRequestClose={() => setClosureOpen(false)}
        transparent
        visible={closureOpen}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            accessibilityViewIsModal
            contentContainerStyle={styles.closureSheetContent}
            style={styles.closureSheet}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.sheetSeal}>
                <LockKeyhole color={colors.primaryDark} size={25} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.sheetEyebrow}>
                  {closureStatus?.latest
                    ? t("dayClosure.version", {
                        version: closureStatus.latest.version + 1,
                      })
                    : t("dayClosure.firstClosure")}
                </Text>
                <Text style={styles.sheetTitle}>
                  {closureStatus?.latest
                    ? t("dayClosure.confirmCorrection")
                    : t("dayClosure.closeDay")}
                </Text>
              </View>
              <IconButton
                icon={X}
                label={t("app.close")}
                onPress={() => setClosureOpen(false)}
              />
            </View>
            <Text style={styles.sheetLead}>{t("dayClosure.legalHint")}</Text>
            <View style={styles.snapshotRow}>
              <Text style={styles.snapshotNumber}>{entries.length}</Text>
              <Text style={styles.snapshotLabel}>
                {t("dayClosure.snapshotEntries")}
              </Text>
              <View style={styles.snapshotDivider} />
              <Text style={styles.snapshotNumber}>
                {dayClosure?.checks.filter((check) => !check.complete).length ??
                  0}
              </Text>
              <Text style={styles.snapshotLabel}>
                {t("dayClosure.snapshotWarnings")}
              </Text>
            </View>
            {dayClosure?.checks.some((check) => !check.complete) ? (
              <View style={styles.warningLedger}>
                <Text style={styles.warningLedgerTitle}>
                  {t("dayClosure.acknowledgedWarnings")}
                </Text>
                {dayClosure.checks
                  .filter((check) => !check.complete)
                  .map((check) => (
                    <View key={check.key} style={styles.warningLedgerRow}>
                      <AlertTriangle color={colors.warning} size={16} />
                      <Text style={styles.warningLedgerText}>
                        {t(`dayClosure.checks.${check.key}`)}
                      </Text>
                    </View>
                  ))}
              </View>
            ) : null}
            {closureStatus?.latest ? (
              <TextArea
                error={
                  closureError === t("dayClosure.correctionReasonRequired")
                    ? closureError
                    : undefined
                }
                label={t("dayClosure.correctionReason")}
                maxLength={300}
                onChangeText={setCorrectionReason}
                placeholder={t("dayClosure.correctionReasonPlaceholder")}
                value={correctionReason}
              />
            ) : null}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: closureConfirmed }}
              onPress={() => setClosureConfirmed((value) => !value)}
              style={[
                styles.confirmationBox,
                closureConfirmed && styles.confirmationBoxChecked,
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  closureConfirmed && styles.checkboxChecked,
                ]}
              >
                {closureConfirmed ? (
                  <CheckCircle2 color={colors.surface} size={18} />
                ) : null}
              </View>
              <Text style={styles.confirmationText}>
                {t("dayClosure.confirmationStatement")}
              </Text>
            </Pressable>
            {closureError &&
            closureError !== t("dayClosure.correctionReasonRequired") ? (
              <Text style={styles.closureError}>{closureError}</Text>
            ) : null}
            <PrimaryButton
              disabled={
                closingDay ||
                !closureConfirmed ||
                (Boolean(closureStatus?.latest) &&
                  correctionReason.trim().length < 3)
              }
              icon={ShieldCheck}
              onPress={() => void closeDay()}
              title={
                closingDay
                  ? t("app.loading")
                  : closureStatus?.latest
                    ? t("dayClosure.confirmCorrectionAction")
                    : t("dayClosure.confirmCloseAction")
              }
            />
            <Text style={styles.immutableHint}>
              {t("dayClosure.immutableHint")}
            </Text>
          </ScrollView>
        </View>
      </Modal>
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
