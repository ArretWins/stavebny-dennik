import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  Users,
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
import { useApp } from "@/state/app";

export function TodayScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    pendingCount,
    syncNow,
    refreshGallery,
    refreshProjectData,
    lockDiary,
  } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const entries = state.diaryEntries.filter(
    (entry) =>
      entry.projectId === selectedProject?.id && entry.logDate === today,
  );
  const workers = state.workerCheckins.filter(
    (item) =>
      item.projectId === selectedProject?.id &&
      item.checkedInAt.startsWith(today),
  );
  const failedCount = state.outbox.filter(
    (item) => item.status === "failed",
  ).length;
  const unreadCount = state.notifications.filter((item) => !item.readAt).length;
  const photoCount = state.attachments.filter(item => item.projectId === selectedProject?.id).length;
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
        right={<View>
          <IconButton icon={Bell} label={t("notifications.title")} onPress={() => navigation.navigate("Notifications")} />
          {unreadCount ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View> : null}
        </View>}
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
          <View style={styles.galleryIcon}><Images color={colors.primary} size={30} /></View>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>{t("gallery.title")}</Text>
            <Text style={styles.meta}>{t("gallery.photoCount", { count: photoCount })} · {t("gallery.dashboardHint")}</Text>
          </View>
        </View>
        <SecondaryButton title={t("gallery.open")} icon={Images} onPress={() => navigation.navigate("Gallery")} />
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
        onPress={() => void syncNow()}
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
                <>
                  <SecondaryButton
                    title={t("diary.edit")}
                    onPress={() =>
                      navigation.navigate("Diary", { editId: entry.id })
                    }
                  />
                  <SecondaryButton
                    title={t("diary.lock")}
                    onPress={() => void lockDiary(entry.id)}
                  />
                </>
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
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  weatherRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  weatherValue: { color: colors.text, fontSize: 14, fontWeight: "600" },
  workerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  workerCount: { color: colors.text, fontSize: 15, fontWeight: "700" },
  recordTime: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  recordText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  notificationBadge: { position: "absolute", right: -2, top: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" },
  notificationBadgeText: { color: colors.surface, fontSize: 10, fontWeight: "800" },
  galleryCard: { borderTopWidth: 4, borderTopColor: colors.warning },
  galleryRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  galleryIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
