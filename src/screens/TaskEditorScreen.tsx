import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Camera,
  ClipboardCheck,
  ShieldCheck,
  Images,
  MapPin,
  X,
} from "lucide-react-native";
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  ScreenShell,
  TextArea,
  TextField,
  TopBar,
} from "@/components/ui";
import {
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  taskEvidenceRequirement,
  validateTaskInput,
} from "@/domain/planTasks";
import type {
  Attachment,
  SiteTaskKind,
  SiteTaskPriority,
} from "@/domain/types";
import { t } from "@/i18n";
import {
  pickPhoto,
  signedAttachmentUrl,
  type PhotoSource,
} from "@/services/attachments";
import { useAuth } from "@/state/auth";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";
import { TaskTimeline } from "@/components/TaskTimeline";

type Params = {
  taskId?: string;
  defaultKind?: SiteTaskKind;
  planId?: string;
  pageNumber?: number;
  xRatio?: number;
  yRatio?: number;
};

const kinds: SiteTaskKind[] = ["task", "defect", "inspection", "material"];
const priorities: SiteTaskPriority[] = ["low", "normal", "high", "urgent"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EVIDENCE_PER_ROLE = 6;

function validDate(value: string): boolean {
  if (!value) return true;
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function ChoiceRow<T extends string>({
  values,
  value,
  label,
  labelFor,
  onChange,
}: {
  values: T[];
  value: T;
  label: string;
  labelFor: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {values.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected: item === value }}
            onPress={() => onChange(item)}
            style={[styles.choice, item === value && styles.choiceSelected]}
          >
            <Text
              style={[
                styles.choiceText,
                item === value && styles.choiceTextSelected,
              ]}
            >
              {labelFor(item)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function EvidenceSection({
  title,
  photos,
  uriFor,
  onAdd,
  onRemove,
}: {
  title: string;
  photos: Attachment[];
  uriFor: (photo: Attachment) => string;
  onAdd: (source: PhotoSource) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.evidenceHeader}>
        <Text style={styles.label}>{title}</Text>
        <Text style={styles.evidenceCount}>
          {photos.length}/{MAX_EVIDENCE_PER_ROLE}
        </Text>
      </View>
      {photos.length ? (
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoWrap}>
              <Image source={{ uri: uriFor(photo) }} style={styles.photo} />
              {photo.uploadStatus === "pending" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("siteTasks.removePhoto")}
                  onPress={() => onRemove(photo.id)}
                  style={styles.removePhoto}
                >
                  <X color="#FFFFFF" size={14} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.evidenceEmpty}>{t("siteTasks.noEvidence")}</Text>
      )}
      <View style={styles.actions}>
        <SecondaryButton
          title={t("siteTasks.camera")}
          icon={Camera}
          disabled={photos.length >= MAX_EVIDENCE_PER_ROLE}
          style={styles.flex}
          onPress={() => onAdd("camera")}
        />
        <SecondaryButton
          title={t("siteTasks.gallery")}
          icon={Images}
          disabled={photos.length >= MAX_EVIDENCE_PER_ROLE}
          style={styles.flex}
          onPress={() => onAdd("library")}
        />
      </View>
    </View>
  );
}

export function TaskEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: Params };
}) {
  const { userId } = useAuth();
  const {
    selectedProject,
    state,
    addAttachment,
    addSiteTask,
    syncNow,
    updateSiteTask,
    addSiteTaskComment,
  } = useApp();
  const params = route.params ?? {};
  const existing = state.siteTasks.find((item) => item.id === params.taskId);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [kind, setKind] = useState<SiteTaskKind>(
    existing?.kind ?? params.defaultKind ?? "task",
  );
  const [priority, setPriority] = useState<SiteTaskPriority>(
    existing?.priority ?? "normal",
  );
  const [assignedWorkerId, setAssignedWorkerId] = useState(
    existing?.assignedWorkerId,
  );
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const [newEvidence, setNewEvidence] = useState<Attachment[]>([]);
  const [remoteUris, setRemoteUris] = useState<Record<string, string>>({});
  const projectWorkers = state.workers.filter(
    (worker) => worker.projectId === selectedProject?.id,
  );
  const activeWorkers = projectWorkers.filter(
    (worker) => worker.status === "active",
  );
  const hasLocation = !!(existing?.planId ?? params.planId);
  const savedEvidence = useMemo(
    () =>
      existing
        ? state.attachments.filter(
            (photo) =>
              photo.relatedEntityType === "site_task" &&
              photo.relatedEntityId === existing.id,
          )
        : [],
    [existing, state.attachments],
  );
  const allEvidence = useMemo(
    () => [...savedEvidence, ...newEvidence],
    [newEvidence, savedEvidence],
  );
  const beforePhotos = allEvidence.filter(
    (photo) => photo.evidenceRole === "before",
  );
  const afterPhotos = allEvidence.filter(
    (photo) => photo.evidenceRole === "after",
  );
  const taskEvents = existing
    ? state.siteTaskEvents.filter((event) => event.taskId === existing.id)
    : [];

  useEffect(() => {
    let active = true;
    const remote = savedEvidence.filter((photo) => photo.storagePath);
    if (!remote.length)
      return () => {
        active = false;
      };
    void Promise.all(
      remote.map(
        async (photo) =>
          [photo.id, await signedAttachmentUrl(photo.storagePath!)] as const,
      ),
    ).then((entries) => {
      if (!active) return;
      setRemoteUris(
        Object.fromEntries(
          entries.filter((entry): entry is [string, string] => !!entry[1]),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [savedEvidence]);

  const addEvidence = async (
    evidenceRole: "before" | "after",
    source: PhotoSource,
  ) => {
    if (!userId || !selectedProject) return;
    const roleCount = allEvidence.filter(
      (photo) => photo.evidenceRole === evidenceRole,
    ).length;
    if (roleCount >= MAX_EVIDENCE_PER_ROLE) return;
    try {
      const photo = await pickPhoto(
        userId,
        selectedProject.id,
        "site_task",
        source,
        existing?.id,
        evidenceRole,
      );
      if (photo) setNewEvidence((current) => [...current, photo]);
    } catch (error) {
      Alert.alert(
        error instanceof Error && error.message === "CAMERA_PERMISSION_DENIED"
          ? t("errors.cameraPermission")
          : error instanceof Error && error.message === "FILE_TOO_LARGE"
            ? t("errors.fileTooLarge")
            : t("errors.fileUnsupported"),
      );
    }
  };

  const uriFor = (photo: Attachment) => remoteUris[photo.id] || photo.localUri;

  const save = async () => {
    if (!selectedProject) return;
    const validation = validateTaskInput({ title, description });
    if (validation !== "ok") {
      Alert.alert(
        validation === "title_required"
          ? t("siteTasks.titleRequired")
          : t("errors.generic"),
      );
      return;
    }
    if (!validDate(dueDate.trim())) {
      Alert.alert(t("siteTasks.invalidDate"));
      return;
    }
    const evidenceRequirement = taskEvidenceRequirement(
      { kind },
      beforePhotos.length,
      afterPhotos.length,
      "save",
    );
    if (evidenceRequirement === "before") {
      Alert.alert(
        t("siteTasks.beforeRequiredTitle"),
        t("siteTasks.beforeRequiredHint"),
      );
      return;
    }
    setBusy(true);
    try {
      const common = {
        title: title.slice(0, MAX_TASK_TITLE_LENGTH),
        description: description.slice(0, MAX_TASK_DESCRIPTION_LENGTH),
        kind,
        priority,
        assignedWorkerId,
        dueDate: dueDate.trim() || undefined,
      };
      const savedTask = existing
        ? await updateSiteTask(existing.id, common)
        : await addSiteTask({
            ...common,
            projectId: selectedProject.id,
            planId: params.planId,
            pageNumber: params.pageNumber,
            xRatio: params.xRatio,
            yRatio: params.yRatio,
            status: "open",
            completedAt: undefined,
          });
      await Promise.all(
        newEvidence.map((photo) =>
          addAttachment({
            ...photo,
            relatedEntityId: savedTask.id,
          }),
        ),
      );
      void syncNow().catch(() => undefined);
      Alert.alert(t("siteTasks.saved"));
      navigation.goBack();
    } catch {
      Alert.alert(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar
        title={existing ? t("siteTasks.edit") : t("siteTasks.add")}
        onBack={() => navigation.goBack()}
      />
      {hasLocation ? (
        <Card style={styles.locationCard}>
          <MapPin color={colors.primary} size={22} />
          <Text style={styles.locationText}>
            {t("siteTasks.location", {
              page: existing?.pageNumber ?? params.pageNumber ?? 1,
            })}
          </Text>
        </Card>
      ) : null}
      {existing?.sourceChecklistId ? (
        <Card style={styles.sourceCard}>
          <View style={styles.sourceHeader}>
            <ClipboardCheck color={colors.primary} size={22} />
            <View style={styles.flex}>
              <Text style={styles.sourceTitle}>
                {t("siteTasks.fromChecklist")}
              </Text>
              <Text style={styles.sourceHint}>
                {t("siteTasks.fromChecklistHint")}
              </Text>
            </View>
          </View>
          <SecondaryButton
            title={t("siteTasks.openSourceChecklist")}
            onPress={() =>
              navigation.navigate("ChecklistEditor", {
                checklistId: existing.sourceChecklistId,
              })
            }
          />
        </Card>
      ) : null}
      <TextField
        label={t("siteTasks.titleLabel")}
        value={title}
        maxLength={MAX_TASK_TITLE_LENGTH}
        onChangeText={setTitle}
        placeholder={t("siteTasks.titlePlaceholder")}
        autoFocus={!existing}
      />
      <TextArea
        label={t("siteTasks.description")}
        value={description}
        maxLength={MAX_TASK_DESCRIPTION_LENGTH}
        onChangeText={setDescription}
        placeholder={t("siteTasks.descriptionPlaceholder")}
      />
      <ChoiceRow
        label={t("siteTasks.kind")}
        values={kinds}
        value={kind}
        onChange={setKind}
        labelFor={(value) => t(`siteTasks.kindValues.${value}`)}
      />
      <ChoiceRow
        label={t("siteTasks.priority")}
        values={priorities}
        value={priority}
        onChange={setPriority}
        labelFor={(value) => t(`siteTasks.priorityValues.${value}`)}
      />
      <TextField
        label={t("siteTasks.dueDate")}
        value={dueDate}
        onChangeText={setDueDate}
        placeholder={t("siteTasks.dueDatePlaceholder")}
        autoCapitalize="none"
      />
      <View style={styles.field}>
        <Text style={styles.label}>{t("siteTasks.assignee")}</Text>
        <View style={styles.choices}>
          <Pressable
            onPress={() => setAssignedWorkerId(undefined)}
            style={[styles.choice, !assignedWorkerId && styles.choiceSelected]}
          >
            <Text
              style={[
                styles.choiceText,
                !assignedWorkerId && styles.choiceTextSelected,
              ]}
            >
              {t("siteTasks.unassigned")}
            </Text>
          </Pressable>
          {activeWorkers.map((worker) => (
            <Pressable
              key={worker.id}
              onPress={() => setAssignedWorkerId(worker.id)}
              style={[
                styles.choice,
                assignedWorkerId === worker.id && styles.choiceSelected,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  assignedWorkerId === worker.id && styles.choiceTextSelected,
                ]}
              >
                {worker.firstName} {worker.lastName}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <EvidenceSection
        title={t("siteTasks.beforePhotos")}
        photos={beforePhotos}
        uriFor={uriFor}
        onAdd={(source) => void addEvidence("before", source)}
        onRemove={(id) =>
          setNewEvidence((current) =>
            current.filter((photo) => photo.id !== id),
          )
        }
      />
      <EvidenceSection
        title={t("siteTasks.afterPhotos")}
        photos={afterPhotos}
        uriFor={uriFor}
        onAdd={(source) => void addEvidence("after", source)}
        onRemove={(id) =>
          setNewEvidence((current) =>
            current.filter((photo) => photo.id !== id),
          )
        }
      />
      <PrimaryButton
        title={t("siteTasks.save")}
        icon={ClipboardCheck}
        disabled={busy}
        onPress={() => void save()}
      />
      {existing ? (
        <>
          <SecondaryButton
            title={t("evidencePack.open")}
            icon={ShieldCheck}
            onPress={() =>
              navigation.navigate("TaskEvidenceReport", {
                taskId: existing.id,
              })
            }
          />
          <SecondaryButton
            title={t("taskMaterials.taskOpen")}
            onPress={() =>
              navigation.navigate("TaskMaterials", { taskId: existing.id })
            }
          />
          <SecondaryButton
            title={t("taskTools.taskOpen")}
            onPress={() =>
              navigation.navigate("TaskTools", { taskId: existing.id })
            }
          />
          <TaskTimeline
            events={taskEvents}
            workers={projectWorkers}
            onComment={async (body) => {
              await addSiteTaskComment(existing.id, body);
              void syncNow().catch(() => undefined);
            }}
          />
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 12, fontWeight: "700" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  choiceText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  choiceTextSelected: { color: colors.primaryDark },
  evidenceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  evidenceCount: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  evidenceEmpty: { color: colors.textMuted, fontSize: 12 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceAlt,
  },
  photo: { width: "100%", height: "100%" },
  removePhoto: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
  },
  locationText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  sourceCard: {
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sourceTitle: { color: colors.primaryDark, fontSize: 14, fontWeight: "800" },
  sourceHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
