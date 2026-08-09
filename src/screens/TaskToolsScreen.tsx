import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Hammer,
  LockKeyhole,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from "@/components/ui";
import { calculateTaskToolReadiness } from "@/domain/toolReservations";
import { projectToolReference } from "@/domain/tools";
import { t } from "@/i18n";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

export function TaskToolsScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { taskId?: string } };
}) {
  const { selectedProject, state, saveTaskToolRequirements } = useApp();
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>(
    route.params?.taskId,
  );
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        state.taskToolRequirements
          .filter((item) => item.taskId === route.params?.taskId)
          .map((item) => item.toolId),
      ),
  );
  const [busy, setBusy] = useState(false);
  const tasks = state.siteTasks.filter(
    (task) => task.projectId === selectedProject?.id && task.status !== "done",
  );
  const tools = state.projectTools
    .filter(
      (tool) =>
        tool.projectId === selectedProject?.id && tool.status !== "retired",
    )
    .sort((a, b) => a.assetNumber - b.assetNumber);
  const readiness = useMemo(
    () => calculateTaskToolReadiness(tasks, state.taskToolRequirements, tools),
    [tasks, state.taskToolRequirements, tools],
  );
  const edit = (taskId: string) => {
    setEditingTaskId(taskId);
    setSelected(
      new Set(
        state.taskToolRequirements
          .filter((item) => item.taskId === taskId)
          .map((item) => item.toolId),
      ),
    );
  };
  const save = () => {
    if (!editingTaskId) return;
    Alert.alert(
      t("taskTools.confirmTitle"),
      t("taskTools.confirmHint", { count: selected.size }),
      [
        { text: t("app.cancel"), style: "cancel" },
        {
          text: t("app.save"),
          onPress: () => {
            setBusy(true);
            void saveTaskToolRequirements(editingTaskId, [...selected])
              .then(() => setEditingTaskId(undefined))
              .catch(() => Alert.alert(t("taskTools.saveFailed")))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("taskTools.title")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );
  const selectedTask = tasks.find((task) => task.id === editingTaskId);
  return (
    <ScreenShell>
      <TopBar
        title={t("taskTools.title")}
        onBack={() =>
          editingTaskId ? setEditingTaskId(undefined) : navigation.goBack()
        }
      />
      <Card style={styles.hero}>
        <View style={styles.ruler}>
          {Array.from({ length: 11 }).map((_, index) => (
            <View key={index} style={styles.tick} />
          ))}
        </View>
        <View style={styles.heroBody}>
          <Hammer color="#F6B26B" size={34} />
          <View style={styles.flex}>
            <Text style={styles.heroTitle}>{t("taskTools.hero")}</Text>
            <Text style={styles.heroHint}>{t("taskTools.intro")}</Text>
          </View>
        </View>
      </Card>
      {selectedTask ? (
        <>
          <Text style={styles.taskTitle}>{selectedTask.title}</Text>
          <Text style={styles.hint}>{t("taskTools.instruction")}</Text>
          {tools.map((tool) => {
            const active = selected.has(tool.id);
            const unavailable =
              tool.status === "maintenance" || tool.status === "lost";
            return (
              <Pressable
                key={tool.id}
                onPress={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(tool.id)) next.delete(tool.id);
                    else next.add(tool.id);
                    return next;
                  })
                }
              >
                <Card
                  style={{
                    ...styles.tool,
                    ...(active ? styles.toolSelected : {}),
                  }}
                >
                  <View style={styles.row}>
                    <View style={styles.stamp}>
                      <Text style={styles.stampText}>
                        {projectToolReference(tool.assetNumber)}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.toolName}>{tool.name}</Text>
                      <Text
                        style={[
                          styles.meta,
                          unavailable && { color: colors.danger },
                        ]}
                      >
                        {tool.category} · {t(`tools.status.${tool.status}`)}
                      </Text>
                    </View>
                    <View style={[styles.check, active && styles.checkActive]}>
                      {active ? (
                        <Check color="#FFFFFF" size={17} />
                      ) : unavailable ? (
                        <AlertTriangle color={colors.danger} size={17} />
                      ) : null}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
          {!tools.length ? (
            <EmptyState
              title={t("taskTools.emptyTools")}
              hint={t("taskTools.emptyToolsHint")}
            />
          ) : null}
          <PrimaryButton
            title={
              busy ? t("materialStock.saving") : t("taskTools.saveConfirmed")
            }
            disabled={busy}
            onPress={save}
          />
          <SecondaryButton
            title={t("app.cancel")}
            onPress={() => setEditingTaskId(undefined)}
          />
        </>
      ) : (
        <>
          <Text style={styles.section}>{t("taskTools.assignments")}</Text>
          {tasks.map((task) => {
            const item = readiness.find((entry) => entry.taskId === task.id);
            const shortage = (item?.shortageCount ?? 0) > 0;
            return (
              <Pressable key={task.id} onPress={() => edit(task.id)}>
                <Card
                  style={{
                    ...styles.task,
                    borderLeftColor: shortage
                      ? colors.danger
                      : item?.requiredCount
                        ? colors.primary
                        : colors.border,
                  }}
                >
                  <View style={styles.row}>
                    {shortage ? (
                      <AlertTriangle color={colors.danger} size={23} />
                    ) : item?.requiredCount ? (
                      <Hammer color={colors.primary} size={23} />
                    ) : (
                      <ClipboardList color={colors.textMuted} size={23} />
                    )}
                    <View style={styles.flex}>
                      <Text style={styles.taskName}>{task.title}</Text>
                      <Text
                        style={[
                          styles.meta,
                          shortage && { color: colors.danger },
                        ]}
                      >
                        {shortage
                          ? t("taskTools.shortage", {
                              count: item?.shortageCount ?? 0,
                            })
                          : item?.requiredCount
                            ? t("taskTools.ready", {
                                count: item.requiredCount,
                              })
                            : t("taskTools.unplanned")}
                      </Text>
                    </View>
                    <Text style={styles.edit}>{t("taskMaterials.edit")}</Text>
                  </View>
                  {item?.allocations.map((allocation) => (
                    <View key={allocation.id} style={styles.allocation}>
                      <LockKeyhole
                        color={
                          allocation.available ? colors.primary : colors.danger
                        }
                        size={15}
                      />
                      <Text style={styles.allocationText}>
                        {projectToolReference(allocation.assetNumber)} ·{" "}
                        {allocation.toolName}
                        {allocation.shortageReason
                          ? ` · ${t(`taskTools.reason.${allocation.shortageReason}`)}`
                          : ""}
                      </Text>
                    </View>
                  ))}
                </Card>
              </Pressable>
            );
          })}
          {!tasks.length ? (
            <EmptyState
              title={t("taskMaterials.emptyTasks")}
              hint={t("taskMaterials.emptyTasksHint")}
            />
          ) : null}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    padding: 0,
    overflow: "hidden",
    backgroundColor: "#1F2A30",
    borderColor: "#1F2A30",
  },
  ruler: {
    height: 12,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    backgroundColor: "#11191D",
  },
  tick: { width: 1, height: 6, backgroundColor: "#718087" },
  heroBody: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    padding: spacing.lg,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  heroHint: { color: "#B9C2C7", lineHeight: 18, marginTop: 3 },
  flex: { flex: 1 },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  taskTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  hint: { color: colors.textMuted, lineHeight: 20 },
  tool: { borderWidth: 1 },
  toolSelected: { borderColor: "#2B6F95", backgroundColor: "#F1F7FA" },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  stamp: {
    backgroundColor: "#E9EEF0",
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderRadius: 5,
  },
  stampText: {
    fontFamily: "monospace",
    color: "#26343B",
    fontSize: 11,
    fontWeight: "900",
  },
  toolName: { color: colors.text, fontSize: 15, fontWeight: "900" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkActive: { backgroundColor: "#2B6F95", borderColor: "#2B6F95" },
  task: { borderLeftWidth: 6 },
  taskName: { color: colors.text, fontSize: 16, fontWeight: "900" },
  edit: { color: colors.primary, fontWeight: "800" },
  allocation: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginTop: spacing.sm,
    marginLeft: 31,
  },
  allocationText: { color: colors.textMuted, fontSize: 12, flex: 1 },
});
