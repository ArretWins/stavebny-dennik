import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CheckCircle2,
  CalendarDays,
  ClipboardList,
  Plus,
  RefreshCw,
  RotateCcw,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from "@/components/ui";
import { taskEvidenceRequirement, taskIsOverdue } from "@/domain/planTasks";
import type { SiteTask, SiteTaskKind } from "@/domain/types";
import { t } from "@/i18n";
import { localDateIso } from "@/domain/ids";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

type Filter = "open" | "review" | "all" | "done";

function TaskCard({
  task,
  workerName,
  beforeCount,
  afterCount,
  onEdit,
  onStatus,
  onAccept,
  onRework,
}: {
  task: SiteTask;
  workerName?: string;
  beforeCount: number;
  afterCount: number;
  onEdit: () => void;
  onStatus: (status: SiteTask["status"]) => void;
  onAccept: () => void;
  onRework: () => void;
}) {
  const today = localDateIso();
  const overdue = taskIsOverdue(task, today);
  const edgeColor =
    task.status === "done"
      ? colors.primary
      : task.status === "review"
        ? colors.warning
        : task.priority === "urgent"
          ? colors.danger
          : task.priority === "high"
            ? colors.warning
            : colors.border;
  return (
    <Card style={{ ...styles.taskCard, borderLeftColor: edgeColor }}>
      <Pressable accessibilityRole="button" onPress={onEdit}>
        <View style={styles.taskHeader}>
          <View style={styles.flex}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.meta}>
              {t(`siteTasks.kindValues.${task.kind}`)} ·{" "}
              {t(`siteTasks.priorityValues.${task.priority}`)}
            </Text>
          </View>
          <View
            style={[
              styles.status,
              task.status === "done" && styles.statusDone,
              task.status === "review" && styles.statusReview,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                task.status === "done" && styles.statusDoneText,
                task.status === "review" && styles.statusReviewText,
              ]}
            >
              {t(`siteTasks.statusValues.${task.status}`)}
            </Text>
          </View>
        </View>
        {task.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {task.description}
          </Text>
        ) : null}
        {task.sourceChecklistId ? (
          <Text style={styles.source}>{t("siteTasks.fromChecklist")}</Text>
        ) : null}
        <Text style={[styles.meta, overdue && styles.overdue]}>
          {task.planId
            ? t("siteTasks.location", { page: task.pageNumber ?? 1 })
            : t("siteTasks.noLocation")}
          {task.dueDate
            ? ` · ${task.dueDate}${overdue ? ` · ${t("siteTasks.overdue")}` : ""}`
            : ""}
          {workerName ? ` · ${workerName}` : ""}
        </Text>
        {task.kind === "defect" || beforeCount || afterCount ? (
          <Text style={styles.evidenceMeta}>
            {t("siteTasks.evidenceSummary", {
              before: beforeCount,
              after: afterCount,
            })}
          </Text>
        ) : null}
        {task.status === "review" ? (
          <View style={styles.reviewNotice}>
            <Text style={styles.reviewNoticeTitle}>
              {t("siteTasks.awaitingReview")}
            </Text>
            {task.submittedAt ? (
              <Text style={styles.meta}>
                {t("siteTasks.submittedAt", {
                  date: new Date(task.submittedAt).toLocaleString("sk-SK"),
                })}
              </Text>
            ) : null}
          </View>
        ) : null}
        {task.reviewNote ? (
          <View style={styles.reworkNote}>
            <Text style={styles.reworkLabel}>
              {t("siteTasks.revisionCount", {
                count: task.revisionCount ?? 1,
              })}
            </Text>
            <Text style={styles.description}>{task.reviewNote}</Text>
          </View>
        ) : null}
      </Pressable>
      {task.status === "review" ? (
        <View style={styles.actions}>
          <SecondaryButton
            title={t("siteTasks.returnForRework")}
            icon={RotateCcw}
            style={styles.flex}
            onPress={onRework}
          />
          <PrimaryButton
            title={t("siteTasks.accept")}
            icon={CheckCircle2}
            style={styles.flex}
            onPress={onAccept}
          />
        </View>
      ) : task.status === "done" ? (
        <SecondaryButton
          title={t("siteTasks.reopen")}
          onPress={() => onStatus("open")}
        />
      ) : (
        <View style={styles.actions}>
          {task.status !== "in_progress" ? (
            <SecondaryButton
              title={t("siteTasks.markInProgress")}
              style={styles.flex}
              onPress={() => onStatus("in_progress")}
            />
          ) : null}
          {workerName ? (
            <Text style={[styles.meta, styles.assignedHint]}>
              {t("siteTasks.assignedWorkflowHint")}
            </Text>
          ) : (
            <PrimaryButton
              title={t("siteTasks.markDone")}
              icon={CheckCircle2}
              style={styles.flex}
              onPress={() => onStatus("done")}
            />
          )}
        </View>
      )}
    </Card>
  );
}

export function TasksScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { kind?: SiteTaskKind } };
}) {
  const {
    selectedProject,
    state,
    setSiteTaskStatus,
    reviewSiteTask,
    refreshProjectData,
  } = useApp();
  const [filter, setFilter] = useState<Filter>("open");
  const [reviewTarget, setReviewTarget] = useState<SiteTask>();
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const kindFilter = route.params?.kind;
  const defectMode = kindFilter === "defect";
  useEffect(() => {
    void refreshProjectData();
  }, [refreshProjectData]);
  const workersById = useMemo(
    () =>
      new Map(
        state.workers.map((worker) => [
          worker.id,
          `${worker.firstName} ${worker.lastName}`,
        ]),
      ),
    [state.workers],
  );
  const evidenceByTask = useMemo(() => {
    const counts = new Map<string, { before: number; after: number }>();
    for (const photo of state.attachments) {
      if (
        photo.relatedEntityType !== "site_task" ||
        !photo.relatedEntityId ||
        (photo.evidenceRole !== "before" && photo.evidenceRole !== "after")
      )
        continue;
      const current = counts.get(photo.relatedEntityId) ?? {
        before: 0,
        after: 0,
      };
      current[photo.evidenceRole] += 1;
      counts.set(photo.relatedEntityId, current);
    }
    return counts;
  }, [state.attachments]);
  const tasks = useMemo(() => {
    const projectTasks = state.siteTasks.filter(
      (task) =>
        task.projectId === selectedProject?.id &&
        (!kindFilter || task.kind === kindFilter),
    );
    if (filter === "open")
      return projectTasks.filter((task) => task.status !== "done");
    if (filter === "review")
      return projectTasks.filter((task) => task.status === "review");
    if (filter === "done")
      return projectTasks.filter((task) => task.status === "done");
    return projectTasks;
  }, [filter, kindFilter, selectedProject?.id, state.siteTasks]);

  const changeStatus = async (task: SiteTask, status: SiteTask["status"]) => {
    if (status === "done") {
      const evidence = evidenceByTask.get(task.id) ?? {
        before: 0,
        after: 0,
      };
      const requirement = taskEvidenceRequirement(
        task,
        evidence.before,
        evidence.after,
        "complete",
      );
      if (requirement) {
        Alert.alert(
          requirement === "before"
            ? t("siteTasks.beforeRequiredTitle")
            : t("siteTasks.afterRequiredTitle"),
          requirement === "before"
            ? t("siteTasks.beforeRequiredHint")
            : t("siteTasks.afterRequiredHint"),
        );
        return;
      }
    }
    try {
      await setSiteTaskStatus(task.id, status);
    } catch {
      Alert.alert(t("errors.generic"));
    }
  };

  const acceptTask = (task: SiteTask) => {
    Alert.alert(t("siteTasks.acceptTitle"), t("siteTasks.acceptHint"), [
      { text: t("siteTasks.cancel"), style: "cancel" },
      {
        text: t("siteTasks.acceptConfirm"),
        onPress: () => {
          void reviewSiteTask(task.id, "accept")
            .then(() => Alert.alert(t("siteTasks.reviewSaved")))
            .catch(() => Alert.alert(t("errors.generic")));
        },
      },
    ]);
  };

  const openRework = (task: SiteTask) => {
    setReviewNote("");
    setReviewError("");
    setReviewTarget(task);
  };

  const submitRework = async () => {
    if (!reviewTarget) return;
    if (reviewNote.trim().length < 3) {
      setReviewError(t("siteTasks.reworkNoteRequired"));
      return;
    }
    setReviewBusy(true);
    try {
      await reviewSiteTask(reviewTarget.id, "rework", reviewNote);
      setReviewTarget(undefined);
      setReviewNote("");
      Alert.alert(t("siteTasks.reviewSaved"));
    } catch {
      setReviewError(t("errors.generic"));
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar
        title={defectMode ? t("siteTasks.defectsTitle") : t("siteTasks.title")}
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            accessibilityLabel={t("app.retry")}
            onPress={() =>
              void refreshProjectData().catch(() =>
                Alert.alert(t("errors.generic")),
              )
            }
            style={styles.refresh}
          >
            <RefreshCw color={colors.text} size={20} />
          </Pressable>
        }
      />
      <PrimaryButton
        title={defectMode ? t("siteTasks.addDefect") : t("siteTasks.add")}
        icon={Plus}
        onPress={() =>
          navigation.navigate("TaskEditor", {
            defaultKind: kindFilter,
          })
        }
      />
      {!defectMode ? (
        <SecondaryButton
          title={t("tomorrowPlan.open")}
          icon={CalendarDays}
          onPress={() => navigation.navigate("TomorrowPlan")}
        />
      ) : null}
      <View style={styles.filters}>
        {(["open", "review", "all", "done"] as Filter[]).map((item) => (
          <Pressable
            key={item}
            accessibilityState={{ selected: filter === item }}
            onPress={() => setFilter(item)}
            style={[styles.filter, filter === item && styles.filterSelected]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.filterTextSelected,
              ]}
            >
              {t(`siteTasks.filters.${item}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          workerName={
            task.assignedWorkerId
              ? workersById.get(task.assignedWorkerId)
              : undefined
          }
          beforeCount={evidenceByTask.get(task.id)?.before ?? 0}
          afterCount={evidenceByTask.get(task.id)?.after ?? 0}
          onEdit={() => navigation.navigate("TaskEditor", { taskId: task.id })}
          onStatus={(status) => void changeStatus(task, status)}
          onAccept={() => acceptTask(task)}
          onRework={() => openRework(task)}
        />
      ))}
      {!tasks.length ? (
        <EmptyState
          title={
            defectMode ? t("siteTasks.emptyDefects") : t("siteTasks.empty")
          }
          hint={
            defectMode
              ? t("siteTasks.emptyDefectsHint")
              : t("siteTasks.emptyHint")
          }
          action={
            <PrimaryButton
              title={defectMode ? t("siteTasks.addDefect") : t("siteTasks.add")}
              icon={ClipboardList}
              onPress={() =>
                navigation.navigate("TaskEditor", {
                  defaultKind: kindFilter,
                })
              }
            />
          }
        />
      ) : null}
      <Modal
        visible={Boolean(reviewTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!reviewBusy) setReviewTarget(undefined);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("siteTasks.reworkTitle")}</Text>
            <Text style={styles.modalHint}>{t("siteTasks.reworkHint")}</Text>
            <TextInput
              multiline
              autoFocus
              textAlignVertical="top"
              maxLength={500}
              value={reviewNote}
              onChangeText={(value) => {
                setReviewNote(value);
                if (reviewError) setReviewError("");
              }}
              placeholder={t("siteTasks.reworkPlaceholder")}
              placeholderTextColor={colors.textMuted}
              style={styles.reviewInput}
            />
            <Text style={styles.counter}>{reviewNote.length}/500</Text>
            {reviewError ? (
              <Text style={styles.reviewError}>{reviewError}</Text>
            ) : null}
            <View style={styles.actions}>
              <SecondaryButton
                title={t("siteTasks.cancel")}
                style={styles.flex}
                disabled={reviewBusy}
                onPress={() => setReviewTarget(undefined)}
              />
              <PrimaryButton
                title={t("siteTasks.returnForRework")}
                style={styles.flex}
                disabled={reviewBusy}
                onPress={() => void submitRework()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: spacing.sm },
  filter: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  filterTextSelected: { color: colors.primaryDark },
  taskCard: { borderLeftWidth: 6 },
  taskHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  flex: { flex: 1 },
  taskTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  description: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  source: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  status: {
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  statusDone: { backgroundColor: colors.primarySoft },
  statusReview: { backgroundColor: colors.warningSoft },
  statusText: { color: colors.warning, fontSize: 10, fontWeight: "800" },
  statusDoneText: { color: colors.primaryDark },
  statusReviewText: { color: colors.warning },
  overdue: { color: colors.danger, fontWeight: "700", marginTop: spacing.sm },
  evidenceMeta: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  assignedHint: { flex: 1, alignSelf: "center" },
  reviewNotice: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
    padding: spacing.sm,
  },
  reviewNoticeTitle: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "800",
  },
  reworkNote: {
    marginTop: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    paddingLeft: spacing.sm,
  },
  reworkLabel: { color: colors.warning, fontSize: 11, fontWeight: "800" },
  refresh: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.screen,
    backgroundColor: "#11182799",
  },
  modalCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  modalHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  reviewInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing.md,
  },
  counter: { color: colors.textMuted, fontSize: 11, textAlign: "right" },
  reviewError: { color: colors.danger, fontSize: 12, fontWeight: "700" },
});
