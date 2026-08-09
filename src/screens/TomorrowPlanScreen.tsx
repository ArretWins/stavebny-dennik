import React, { useEffect, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  HardHat,
  PackageCheck,
  ShieldCheck,
  Wrench,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from "@/components/ui";
import { localDateIso } from "@/domain/ids";
import { calculateMaterialStock } from "@/domain/materialStock";
import {
  buildTomorrowPlan,
  type TomorrowPlanRisk,
} from "@/domain/tomorrowPlan";
import { t } from "@/i18n";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

const statusColor = {
  ready: colors.primary,
  watch: colors.warning,
  blocked: colors.danger,
} as const;
const riskTarget: Record<
  TomorrowPlanRisk,
  | "TaskEditor"
  | "WorkerCredentials"
  | "TaskMaterials"
  | "TaskTools"
  | "SafetyBriefings"
> = {
  task_blocked: "TaskEditor",
  worker_missing: "TaskEditor",
  worker_inactive: "TaskEditor",
  credential_invalid: "WorkerCredentials",
  materials_unplanned: "TaskMaterials",
  materials_shortage: "TaskMaterials",
  tools_unplanned: "TaskTools",
  tools_shortage: "TaskTools",
  safety_unplanned: "SafetyBriefings",
};

export function TomorrowPlanScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, refreshProjectData } = useApp();
  useEffect(() => {
    void refreshProjectData().catch(() => undefined);
  }, [refreshProjectData, selectedProject?.id]);
  const stock = useMemo(
    () =>
      selectedProject
        ? calculateMaterialStock(
            selectedProject.id,
            state.materialDeliveries,
            state.materialDeliveryLines,
            state.materialStockMovements,
          )
        : [],
    [
      selectedProject,
      state.materialDeliveries,
      state.materialDeliveryLines,
      state.materialStockMovements,
    ],
  );
  const plan = useMemo(
    () =>
      buildTomorrowPlan({
        projectId: selectedProject?.id ?? "",
        today: localDateIso(),
        tasks: state.siteTasks,
        workers: state.workers,
        credentials: state.workerCredentials,
        requirements: state.taskMaterialRequirements,
        toolRequirements: state.taskToolRequirements,
        stock,
        tools: state.projectTools,
        safetyBriefings: state.safetyBriefings,
        safetyRecipients: state.safetyBriefingRecipients,
      }),
    [
      selectedProject?.id,
      state.siteTasks,
      state.workers,
      state.workerCredentials,
      state.taskMaterialRequirements,
      state.taskToolRequirements,
      stock,
      state.projectTools,
      state.safetyBriefings,
      state.safetyBriefingRecipients,
    ],
  );
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("tomorrowPlan.title")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );
  const openRisk = (
    risk: TomorrowPlanRisk,
    taskId: string,
    workerId?: string,
  ) => {
    const target = riskTarget[risk];
    if (target === "TaskEditor") navigation.navigate(target, { taskId });
    else if (target === "WorkerCredentials" && workerId)
      navigation.navigate(target);
    else if (target === "TaskMaterials")
      navigation.navigate(target, { taskId });
    else if (target === "TaskTools") navigation.navigate(target, { taskId });
    else navigation.navigate(target);
  };
  return (
    <ScreenShell>
      <TopBar
        title={t("tomorrowPlan.title")}
        onBack={() => navigation.goBack()}
      />
      <Card style={styles.dispatch}>
        <View style={styles.dateBlock}>
          <Text style={styles.day}>{plan.planDate.slice(8, 10)}</Text>
          <Text style={styles.month}>
            {plan.planDate.slice(5, 7)} / {plan.planDate.slice(0, 4)}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.kicker}>{t("tomorrowPlan.dispatch")}</Text>
          <Text style={styles.headline}>
            {plan.blockedCount
              ? t("tomorrowPlan.blockedHeadline", { count: plan.blockedCount })
              : t("tomorrowPlan.readyHeadline")}
          </Text>
          <Text style={styles.subhead}>
            {t("tomorrowPlan.summary", {
              tasks: plan.tasks.length,
              workers: plan.plannedWorkerCount,
            })}
          </Text>
        </View>
      </Card>
      <View style={styles.scoreboard}>
        <View style={styles.score}>
          <Text style={[styles.scoreNumber, { color: colors.primary }]}>
            {plan.readyCount}
          </Text>
          <Text style={styles.scoreLabel}>{t("tomorrowPlan.ready")}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.score}>
          <Text style={[styles.scoreNumber, { color: colors.warning }]}>
            {plan.watchCount}
          </Text>
          <Text style={styles.scoreLabel}>{t("tomorrowPlan.watch")}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.score}>
          <Text style={[styles.scoreNumber, { color: colors.danger }]}>
            {plan.blockedCount}
          </Text>
          <Text style={styles.scoreLabel}>{t("tomorrowPlan.blocked")}</Text>
        </View>
      </View>
      <Text style={styles.section}>{t("tomorrowPlan.workOrder")}</Text>
      {plan.tasks.map((item, index) => (
        <Card
          key={item.task.id}
          style={{
            ...styles.task,
            borderLeftColor: statusColor[item.readiness],
          }}
        >
          <View style={styles.taskTop}>
            <View
              style={[
                styles.sequence,
                { backgroundColor: statusColor[item.readiness] },
              ]}
            >
              <Text style={styles.sequenceText}>
                {String(index + 1).padStart(2, "0")}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.taskTitle}>{item.task.title}</Text>
              <Text style={styles.meta}>
                {item.worker
                  ? `${item.worker.firstName} ${item.worker.lastName} · ${item.worker.position}`
                  : t("tomorrowPlan.noWorker")}
              </Text>
            </View>
            {item.readiness === "ready" ? (
              <Check color={colors.primary} size={24} />
            ) : (
              <AlertTriangle color={statusColor[item.readiness]} size={24} />
            )}
          </View>
          <View style={styles.readinessLine}>
            <View style={styles.readinessItem}>
              <HardHat
                color={
                  item.worker?.status === "active"
                    ? colors.primary
                    : colors.danger
                }
                size={18}
              />
              <Text style={styles.readinessText}>
                {t("tomorrowPlan.person")}
              </Text>
            </View>
            <View style={styles.readinessItem}>
              <PackageCheck
                color={
                  item.material.ready
                    ? colors.primary
                    : item.material.requiredCount
                      ? colors.danger
                      : colors.warning
                }
                size={18}
              />
              <Text style={styles.readinessText}>
                {t("tomorrowPlan.material")}
              </Text>
            </View>
            <View style={styles.readinessItem}>
              <ShieldCheck
                color={item.briefingPrepared ? colors.primary : colors.warning}
                size={18}
              />
              <Text style={styles.readinessText}>
                {t("tomorrowPlan.safety")}
              </Text>
            </View>
            <View style={styles.readinessItem}>
              <Wrench
                color={
                  item.tool.ready
                    ? colors.primary
                    : item.tool.requiredCount
                      ? colors.danger
                      : colors.warning
                }
                size={18}
              />
              <Text style={styles.readinessText}>
                {item.tool.requiredCount}
              </Text>
            </View>
          </View>
          {item.material.allocations.length ? (
            <Text style={styles.materials}>
              {item.material.allocations
                .map(
                  (line) =>
                    `${line.materialName} ${line.quantity} ${line.unit}${line.shortageQuantity ? ` (−${line.shortageQuantity})` : ""}`,
                )
                .join(" · ")}
            </Text>
          ) : null}
          {item.risks.map((risk) => (
            <Pressable
              key={risk}
              onPress={() => openRisk(risk, item.task.id, item.worker?.id)}
              style={styles.risk}
            >
              <Text style={styles.riskText}>
                {t(`tomorrowPlan.risk.${risk}`)}
              </Text>
              <ChevronRight color={colors.warning} size={18} />
            </Pressable>
          ))}
        </Card>
      ))}
      {!plan.tasks.length ? (
        <EmptyState
          title={t("tomorrowPlan.empty")}
          hint={t("tomorrowPlan.emptyHint")}
        />
      ) : null}
      <Text style={styles.section}>{t("tomorrowPlan.resources")}</Text>
      <Card style={styles.resources}>
        <View style={styles.resource}>
          <HardHat color={colors.primaryDark} size={25} />
          <Text style={styles.resourceNumber}>{plan.plannedWorkerCount}</Text>
          <Text style={styles.resourceLabel}>
            {t("tomorrowPlan.peoplePlanned")}
          </Text>
        </View>
        <View style={styles.resource}>
          <Wrench color={colors.primaryDark} size={25} />
          <Text style={styles.resourceNumber}>{plan.availableToolCount}</Text>
          <Text style={styles.resourceLabel}>
            {t("tomorrowPlan.toolsAvailable")}
          </Text>
        </View>
        <View style={styles.resource}>
          <ClipboardCheck color={colors.primaryDark} size={25} />
          <Text style={styles.resourceNumber}>{plan.briefingCount}</Text>
          <Text style={styles.resourceLabel}>
            {t("tomorrowPlan.briefings")}
          </Text>
        </View>
      </Card>
      {plan.unscheduledTaskCount ? (
        <SecondaryButton
          title={t("tomorrowPlan.scheduleBacklog", {
            count: plan.unscheduledTaskCount,
          })}
          icon={CalendarDays}
          onPress={() => navigation.navigate("Tasks")}
        />
      ) : null}
      {plan.unavailableToolCount ? (
        <SecondaryButton
          title={t("tomorrowPlan.fixTools", {
            count: plan.unavailableToolCount,
          })}
          icon={Wrench}
          onPress={() => navigation.navigate("Tools")}
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  dispatch: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: "#173A36",
    borderColor: "#173A36",
  },
  dateBlock: {
    width: 74,
    backgroundColor: "#F2C14E",
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  day: { color: "#173A36", fontSize: 34, lineHeight: 36, fontWeight: "900" },
  month: { color: "#173A36", fontSize: 11, fontWeight: "800" },
  flex: { flex: 1 },
  kicker: {
    color: "#82DFC0",
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "900",
  },
  headline: { color: "#FFFFFF", fontSize: 20, fontWeight: "900", marginTop: 3 },
  subhead: { color: "#B9D7D0", marginTop: 4 },
  scoreboard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  score: { flex: 1, alignItems: "center" },
  scoreNumber: { fontSize: 26, fontWeight: "900" },
  scoreLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  divider: { width: 1, backgroundColor: colors.border },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  task: { borderLeftWidth: 6, gap: spacing.sm },
  taskTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sequence: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sequenceText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  taskTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  readinessLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  readinessItem: { alignItems: "center", gap: 2, minWidth: 54 },
  readinessText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  materials: { color: colors.text, fontSize: 12, lineHeight: 18 },
  risk: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  riskText: { color: "#7A4300", fontSize: 12, fontWeight: "700", flex: 1 },
  resources: { flexDirection: "row", paddingVertical: spacing.lg },
  resource: { flex: 1, alignItems: "center", gap: 3 },
  resourceNumber: { color: colors.text, fontSize: 22, fontWeight: "900" },
  resourceLabel: { color: colors.textMuted, fontSize: 10, textAlign: "center" },
});
