import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Camera, Images, RefreshCw, ShieldCheck, X } from "lucide-react-native";
import {
  Card,
  EmptyState,
  IconButton,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from "@/components/ui";
import type { Attachment } from "@/domain/types";
import {
  filterGalleryAttachments,
  galleryCategory,
  groupGalleryByDay,
  type GalleryFilter,
} from "@/domain/gallery";
import { formatDate, formatTime } from "@/i18n/format";
import { t } from "@/i18n";
import {
  pickPhoto,
  signedAttachmentUrl,
  type PhotoSource,
} from "@/services/attachments";
import { useApp } from "@/state/app";
import { useAuth } from "@/state/auth";
import { colors, radius, shadows, spacing } from "@/theme/tokens";

const filters: GalleryFilter[] = ["all", "work", "delay", "other"];

export function GalleryScreen({ navigation }: { navigation: any }) {
  const { userId } = useAuth();
  const { selectedProject, state, addAttachment, refreshGallery, syncNow } =
    useApp();
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [selected, setSelected] = useState<Attachment>();
  const [remoteUris, setRemoteUris] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const projectAttachments = useMemo(
    () =>
      state.attachments.filter(
        (item) => item.projectId === selectedProject?.id,
      ),
    [selectedProject?.id, state.attachments],
  );
  const filtered = useMemo(
    () => filterGalleryAttachments(projectAttachments, filter),
    [filter, projectAttachments],
  );
  const groups = useMemo(() => groupGalleryByDay(filtered), [filtered]);
  const storageKey = projectAttachments
    .map((item) => `${item.id}:${item.storagePath ?? ""}`)
    .join("|");

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshGallery();
    } catch {
      Alert.alert(t("gallery.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [selectedProject?.id]);

  useEffect(() => {
    let active = true;
    void Promise.all(
      projectAttachments
        .filter((item) => item.storagePath)
        .map(
          async (item) =>
            [item.id, await signedAttachmentUrl(item.storagePath!)] as const,
        ),
    )
      .then((entries) => {
        if (!active) return;
        setRemoteUris(
          Object.fromEntries(
            entries.filter(
              (entry): entry is readonly [string, string] => !!entry[1],
            ),
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [storageKey]);

  if (!selectedProject) {
    return (
      <ScreenShell>
        <TopBar title={t("gallery.title")} onBack={() => navigation.goBack()} />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );
  }

  const addPhoto = async (source: PhotoSource) => {
    if (!userId) return;
    setBusy(true);
    try {
      const photo = await pickPhoto(
        userId,
        selectedProject.id,
        "attachment",
        source,
      );
      if (!photo) return;
      await addAttachment(photo);
      await syncNow().catch(() => undefined);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "CAMERA_PERMISSION_DENIED"
          ? t("errors.cameraPermission")
          : error instanceof Error && error.message === "FILE_TOO_LARGE"
            ? t("errors.fileTooLarge")
            : t("errors.fileUnsupported");
      Alert.alert(message);
    } finally {
      setBusy(false);
    }
  };

  const uriFor = (attachment: Attachment) =>
    remoteUris[attachment.id] || attachment.localUri;
  const sourceLabel = (attachment: Attachment) =>
    attachment.captureSource === "camera"
      ? t("gallery.sourceCamera")
      : attachment.captureSource === "library"
        ? t("gallery.sourceLibrary")
        : attachment.captureSource === "worker_portal"
          ? t("gallery.sourceWorkerPortal")
          : t("gallery.legacyPhoto");

  return (
    <>
      <ScreenShell>
        <TopBar
          title={t("gallery.title")}
          onBack={() => navigation.goBack()}
          right={
            <IconButton
              icon={RefreshCw}
              label={t("app.retry")}
              onPress={() => void refresh()}
            />
          }
        />
        <Card style={styles.hero}>
          <View style={styles.timelineMark} />
          <View style={styles.heroIcon}>
            <Images color={colors.surface} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroEyebrow}>{selectedProject.name}</Text>
            <Text style={styles.heroCount}>
              {t("gallery.photoCount", { count: projectAttachments.length })}
            </Text>
            <Text style={styles.heroHint}>{t("gallery.timelineHint")}</Text>
          </View>
          {refreshing ? <ActivityIndicator color={colors.surface} /> : null}
        </Card>

        <View style={styles.actions}>
          <PrimaryButton
            title={t("attachments.camera")}
            icon={Camera}
            onPress={() => void addPhoto("camera")}
            disabled={busy}
            style={styles.action}
          />
          <SecondaryButton
            title={t("gallery.fromDevice")}
            icon={Images}
            onPress={() => void addPhoto("library")}
            disabled={busy}
            style={styles.action}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((item) => {
            const active = filter === item;
            const count = projectAttachments.filter(
              (photo) => item === "all" || galleryCategory(photo) === item,
            ).length;
            return (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[styles.filter, active && styles.filterActive]}
              >
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {t(`gallery.filters.${item}`)} · {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {groups.map((group) => (
          <View key={group.date} style={styles.day}>
            <View style={styles.dayHeading}>
              <View style={styles.dayDot} />
              <Text style={styles.dayTitle}>{formatDate(group.date)}</Text>
            </View>
            <View style={styles.grid}>
              {group.items.map((attachment) => {
                const uri = uriFor(attachment);
                return (
                  <Pressable
                    key={attachment.id}
                    accessibilityRole="button"
                    onPress={() => setSelected(attachment)}
                    style={styles.photoCard}
                  >
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={styles.photo}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.photo, styles.photoFallback]}>
                        <Images color={colors.textMuted} size={30} />
                      </View>
                    )}
                    <View style={styles.photoMeta}>
                      <Text style={styles.category}>
                        {t(`gallery.filters.${galleryCategory(attachment)}`)}
                      </Text>
                      <Text style={styles.time}>
                        {formatTime(attachment.createdAt)}
                      </Text>
                    </View>
                    {attachment.uploadStatus !== "synced" ? (
                      <View style={styles.pending}>
                        <Text style={styles.pendingText}>
                          {t("evidence.pending")}
                        </Text>
                      </View>
                    ) : null}
                    {attachment.contentSha256 ? (
                      <View style={styles.protected}>
                        <ShieldCheck color={colors.primaryDark} size={12} />
                        <Text style={styles.protectedText}>
                          {t("gallery.protected")}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {!filtered.length ? (
          <Card>
            <EmptyState
              title={t("gallery.empty")}
              hint={t("gallery.emptyHint")}
              action={
                <PrimaryButton
                  title={t("gallery.addFirst")}
                  icon={Camera}
                  onPress={() => void addPhoto("camera")}
                  disabled={busy}
                />
              }
            />
          </Card>
        ) : null}
      </ScreenShell>

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(undefined)}
      >
        <View style={styles.viewer}>
          <Pressable
            accessibilityLabel={t("app.close")}
            onPress={() => setSelected(undefined)}
            style={styles.close}
          >
            <X color={colors.surface} size={28} />
          </Pressable>
          {selected && uriFor(selected) ? (
            <Image
              source={{ uri: uriFor(selected) }}
              style={styles.fullPhoto}
              resizeMode="contain"
            />
          ) : null}
          {selected ? (
            <View style={styles.viewerCaption}>
              <Text style={styles.viewerTitle}>
                {t(`gallery.filters.${galleryCategory(selected)}`)}
              </Text>
              <Text style={styles.viewerMeta}>
                {formatDate(selected.capturedAt ?? selected.createdAt)} ·{" "}
                {formatTime(selected.capturedAt ?? selected.createdAt)}
              </Text>
              <View style={styles.evidencePanel}>
                <Text style={styles.evidenceTitle}>
                  {t("gallery.evidenceDetails")}
                </Text>
                <Text style={styles.evidenceLine}>
                  {t("gallery.source")}: {sourceLabel(selected)}
                </Text>
                <Text style={styles.evidenceLine}>
                  {t("gallery.gps")}:{" "}
                  {selected.latitude !== undefined &&
                  selected.longitude !== undefined
                    ? `${selected.latitude.toFixed(5)}, ${selected.longitude.toFixed(5)}`
                    : t("gallery.noGps")}
                </Text>
                {selected.contentSha256 ? (
                  <>
                    <Text style={styles.evidenceLine}>
                      {t("gallery.storedDigest")}:
                    </Text>
                    <Text selectable style={styles.digest}>
                      {selected.contentSha256}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.evidenceLine}>
                    {t("gallery.legacyPhoto")}
                  </Text>
                )}
                <Text style={styles.evidenceHint}>
                  {t("gallery.digestHint")}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  timelineMark: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: colors.warning,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: { color: "#CDE4CA", fontSize: 12, fontWeight: "700" },
  heroCount: {
    color: colors.surface,
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 29,
  },
  heroHint: { color: "#E8F1E7", fontSize: 12, lineHeight: 17 },
  flex: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1, paddingHorizontal: spacing.sm },
  filters: { gap: spacing.sm, paddingRight: spacing.screen },
  filter: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
  },
  filterActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  filterTextActive: { color: colors.primaryDark },
  day: { gap: spacing.sm },
  dayHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
  },
  dayTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoCard: {
    width: "48.5%",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  photo: {
    width: "100%",
    aspectRatio: 1.15,
    backgroundColor: colors.primarySoft,
  },
  photoFallback: { alignItems: "center", justifyContent: "center" },
  photoMeta: {
    padding: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  category: { color: colors.text, fontSize: 11, fontWeight: "800", flex: 1 },
  time: { color: colors.textMuted, fontSize: 11 },
  pending: {
    position: "absolute",
    left: spacing.xs,
    top: spacing.xs,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pendingText: { color: colors.warning, fontSize: 9, fontWeight: "800" },
  protected: {
    position: "absolute",
    right: spacing.xs,
    top: spacing.xs,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  protectedText: { color: colors.primaryDark, fontSize: 8, fontWeight: "800" },
  viewer: {
    flex: 1,
    backgroundColor: "rgba(7, 14, 11, 0.96)",
    justifyContent: "center",
  },
  close: {
    position: "absolute",
    zIndex: 2,
    top: 48,
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullPhoto: { width: "100%", height: "78%" },
  viewerCaption: {
    position: "absolute",
    left: spacing.xl,
    right: spacing.xl,
    bottom: 24,
  },
  viewerTitle: { color: colors.surface, fontSize: 18, fontWeight: "800" },
  viewerMeta: { color: "#D1D5DB", fontSize: 13, marginTop: spacing.xs },
  evidencePanel: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(23,63,53,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    padding: spacing.sm,
  },
  evidenceTitle: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 4,
  },
  evidenceLine: { color: "#E5E7EB", fontSize: 11, lineHeight: 16 },
  digest: {
    color: "#CDE4CA",
    fontSize: 9,
    lineHeight: 13,
    fontFamily: "monospace",
  },
  evidenceHint: { color: "#BFC8C3", fontSize: 9, lineHeight: 13, marginTop: 4 },
});
