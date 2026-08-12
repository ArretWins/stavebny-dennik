import React, { useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarDays, CheckCircle2, CloudSun } from "lucide-react-native";
import {
  ScreenShell,
  TopBar,
  Card,
  TextArea,
  TextField,
  CounterInput,
  DashedUploadBox,
  EvidenceStrip,
  PrimaryButton,
} from "@/components/ui";
import { colors, spacing } from "@/theme/tokens";
import { formatDate, formatDateTime } from "@/i18n/format";
import { t } from "@/i18n";
import { localDateIso, nowIso } from "@/domain/ids";
import { validateDiaryInput } from "@/domain/validation";
import type {
  Attachment,
  EvidenceBundle,
  GpsEvidence,
  WeatherSnapshot,
} from "@/domain/types";
import { captureGps, fetchWeather } from "@/services/evidence";
import { manualWeatherSnapshot } from "@/domain/weather";
import { pickPhoto, type PhotoSource } from "@/services/attachments";
import { useApp } from "@/state/app";
import { useAuth } from "@/state/auth";
import { VoiceDraftControl } from "@/components/VoiceDraftControl";
import { DiaryLegalFields } from "@/components/DiaryLegalFields";
import {
  normalizeDiaryLegalDetails,
  validateDiaryLegalDetails,
  type DiaryLegalDetails,
} from "@/domain/legalDiary";
import {
  applyStructuredVoiceDraft,
  type StructuredVoiceDraft,
} from "@/domain/voiceDraft";

export function DiaryScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: {
    params?: {
      correctionOfId?: string;
      editId?: string;
      draft?: {
        logDate: string;
        workDescription: string;
        workerCount: number;
        note: string;
      };
    };
  };
}) {
  const { selectedProject, state, addDiary, updateDiary, addAttachment } =
    useApp();
  const { userId } = useAuth();
  const existing = route.params?.editId
    ? state.diaryEntries.find((entry) => entry.id === route.params?.editId)
    : undefined;
  const draft = route.params?.draft;
  const existingAttachment = existing
    ? state.attachments.find((item) =>
        existing.evidence.attachmentIds.includes(item.id),
      )
    : undefined;
  const [work, setWork] = useState(
    existing?.workDescription ?? draft?.workDescription ?? "",
  );
  const [note, setNote] = useState(existing?.note ?? draft?.note ?? "");
  const [correctionReason, setCorrectionReason] = useState(
    existing?.correctionReason ?? "",
  );
  const [workers, setWorkers] = useState(
    existing?.workerCount ?? draft?.workerCount ?? 0,
  );
  const [legalDetails, setLegalDetails] = useState<DiaryLegalDetails>({
    workStartTime: existing?.workStartTime,
    workEndTime: existing?.workEndTime,
    workforceRoles: existing?.workforceRoles ?? [],
    technicalRecords: existing?.technicalRecords ?? [],
  });
  const [date, setDate] = useState(
    existing
      ? new Date(`${existing.logDate}T12:00:00`)
      : draft
        ? new Date(`${draft.logDate}T12:00:00`)
        : new Date(),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gps, setGps] = useState<GpsEvidence | undefined>(
    existing?.evidence.gps,
  );
  const [weather, setWeather] = useState<WeatherSnapshot | undefined>(
    existing?.evidence.weather,
  );
  const [manualWeatherOpen, setManualWeatherOpen] = useState(
    existing?.evidence.weather?.provider === "manual",
  );
  const [manualTemperature, setManualTemperature] = useState(
    existing?.evidence.weather?.temperatureC?.toString() ?? "",
  );
  const [manualDescription, setManualDescription] = useState(
    existing?.evidence.weather?.manualDescription ?? "",
  );
  const [manualWind, setManualWind] = useState(
    existing?.evidence.weather?.windSpeedKmh?.toString() ?? "",
  );
  const [manualPrecipitation, setManualPrecipitation] = useState(
    existing?.evidence.weather?.precipitationMm?.toString() ?? "",
  );
  const [attachment, setAttachment] = useState<Attachment | undefined>(
    existingAttachment,
  );
  const [capturedAt] = useState(existing?.evidence.capturedAt ?? nowIso());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const applyVoiceDraft = (voiceDraft: StructuredVoiceDraft) => {
    const applied = applyStructuredVoiceDraft(
      { workDescription: work, workerCount: workers, note },
      voiceDraft,
    );
    setWork(applied.workDescription);
    setWorkers(applied.workerCount);
    setNote(applied.note);
  };
  useEffect(() => {
    if (existing) return;
    let active = true;
    (async () => {
      try {
        const nextGps = await captureGps();
        if (!active) return;
        setGps(nextGps);
        try {
          setWeather(await fetchWeather(nextGps));
        } catch {
          setWeather({
            provider: "open-meteo",
            requestUrl: "",
            latitude: nextGps.latitude,
            longitude: nextGps.longitude,
            capturedAt: nextGps.capturedAt,
            rawJson: {},
            status: "pending",
          });
        }
      } catch {
        /* GPS is optional evidence */
      }
    })();
    return () => {
      active = false;
    };
  }, [existing]);
  const addPhoto = async (source: PhotoSource) => {
    if (!userId || !selectedProject) return;
    setError("");
    try {
      const photo = await pickPhoto(
        userId,
        selectedProject.id,
        "diary_entry",
        source,
      );
      if (photo) setAttachment(photo);
    } catch (photoError) {
      setError(
        photoError instanceof Error && photoError.message === "FILE_TOO_LARGE"
          ? t("errors.fileTooLarge")
          : photoError instanceof Error &&
              photoError.message === "CAMERA_PERMISSION_DENIED"
            ? t("errors.cameraPermission")
            : t("errors.fileUnsupported"),
      );
    }
  };
  const choosePhoto = () =>
    Alert.alert(t("attachments.sourceTitle"), t("attachments.sourceHint"), [
      {
        text: t("attachments.gallery"),
        onPress: () => void addPhoto("library"),
      },
      { text: t("attachments.camera"), onPress: () => void addPhoto("camera") },
      { text: t("app.cancel"), style: "cancel" },
    ]);
  const saveManualWeather = () => {
    const temperatureC = Number(manualTemperature.replace(",", "."));
    const windSpeedKmh = manualWind.trim()
      ? Number(manualWind.replace(",", "."))
      : undefined;
    const precipitationMm = manualPrecipitation.trim()
      ? Number(manualPrecipitation.replace(",", "."))
      : undefined;
    if (
      !Number.isFinite(temperatureC) ||
      temperatureC < -60 ||
      temperatureC > 60 ||
      (windSpeedKmh !== undefined && (!Number.isFinite(windSpeedKmh) || windSpeedKmh < 0 || windSpeedKmh > 250)) ||
      (precipitationMm !== undefined && (!Number.isFinite(precipitationMm) || precipitationMm < 0 || precipitationMm > 500))
    ) {
      setError(t("diary.manualWeatherInvalid"));
      return;
    }
    setWeather(
      manualWeatherSnapshot({
        temperatureC,
        description: manualDescription,
        windSpeedKmh,
        precipitationMm,
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        capturedAt,
      }),
    );
    setError("");
    setManualWeatherOpen(false);
  };
  const save = async () => {
    const errors = validateDiaryInput({
      workDescription: work,
      workerCount: workers,
      note,
    });
    if (errors.length) {
      const first = errors[0];
      setError(
        first === "workRequired"
          ? t("errors.workRequired")
          : first === "workTooLong"
            ? t("errors.workTooLong", { count: 500 })
            : first === "noteTooLong"
              ? t("errors.noteTooLong", { count: 300 })
              : t("errors.generic"),
      );
      return;
    }
    const legalError = validateDiaryLegalDetails({
      ...legalDetails,
      workerCount: workers,
    });
    if (legalError) {
      setError(t(`diaryLegal.error.${legalError}`));
      return;
    }
    if (route.params?.correctionOfId && correctionReason.trim().length < 3) {
      setError(t("dayClosure.correctionReasonRequired"));
      return;
    }
    if (!selectedProject || !userId) return;
    setSaving(true);
    const evidence: EvidenceBundle = {
      gps,
      weather,
      capturedAt,
      attachmentIds: attachment ? [attachment.id] : [],
    };
    const input = {
      projectId: selectedProject.id,
      logDate: localDateIso(date),
      workDescription: work.trim(),
      workerCount: workers,
      ...normalizeDiaryLegalDetails(legalDetails),
      note: note.trim() || undefined,
      evidence,
      correctionOfId: route.params?.correctionOfId,
      correctionReason: route.params?.correctionOfId
        ? correctionReason.trim()
        : existing?.correctionReason,
    };
    try {
      const entry = route.params?.editId
        ? await updateDiary(route.params.editId, input)
        : await addDiary(input);
      if (
        attachment &&
        !state.attachments.some(
          (item) =>
            item.id === attachment.id && item.relatedEntityId === entry.id,
        )
      )
        await addAttachment({ ...attachment, relatedEntityId: entry.id });
      Alert.alert(t("diary.saved"), t("errors.offlineSaved"), [
        { text: t("app.close"), onPress: () => navigation.goBack() },
      ]);
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message === "LOCKED_RECORD"
          ? t("errors.lockedConflict")
          : t("errors.generic"),
      );
    } finally {
      setSaving(false);
    }
  };
  if (!selectedProject) return null;
  return (
    <ScreenShell>
      <TopBar
        title={
          route.params?.correctionOfId
            ? t("diary.correction")
            : route.params?.editId
              ? t("diary.edit")
              : t("diary.title")
        }
        onBack={() => navigation.goBack()}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowDatePicker(true)}
      >
        <Card>
          <View style={styles.dateRow}>
            <CalendarDays color={colors.text} size={21} />
            <Text style={styles.date}>{formatDate(date)}</Text>
          </View>
        </Card>
      </Pressable>
      {showDatePicker ? (
        <DateTimePicker
          value={date}
          mode="date"
          onChange={(_event, value) => {
            setShowDatePicker(false);
            if (value) setDate(value);
          }}
        />
      ) : null}
      {route.params?.correctionOfId ? (
        <Card style={styles.correctionCard}>
          <Text style={styles.correctionTitle}>
            {t("dayClosure.correctionEvidenceTitle")}
          </Text>
          <Text style={styles.warning}>
            {t("dayClosure.correctionEvidenceHint")}
          </Text>
          <TextArea
            label={t("dayClosure.correctionReason")}
            value={correctionReason}
            onChangeText={setCorrectionReason}
            maxLength={300}
            placeholder={t("dayClosure.correctionReasonPlaceholder")}
            error={
              error === t("dayClosure.correctionReasonRequired")
                ? error
                : undefined
            }
          />
        </Card>
      ) : null}
      <TextArea
        label={t("diary.workDone")}
        value={work}
        onChangeText={setWork}
        maxLength={500}
        placeholder={t("diary.workPlaceholder")}
        editable={!voiceListening}
        error={
          error &&
          (error === t("errors.workRequired") ||
            error === t("errors.workTooLong", { count: 500 }))
            ? error
            : undefined
        }
      />
      <VoiceDraftControl
        onApply={applyVoiceDraft}
        onListeningChange={setVoiceListening}
      />
      <View style={styles.field}>
        <Text style={styles.label}>{t("diary.workers")}</Text>
        <CounterInput value={workers} onChange={setWorkers} />
      </View>
      <DiaryLegalFields
        value={legalDetails}
        workerCount={workers}
        onChange={setLegalDetails}
      />
      <Card style={styles.weatherCard}>
        <View style={styles.weatherHeader}>
          <CloudSun color={colors.primary} size={26} />
          <View style={styles.weatherHeaderText}>
            <Text style={styles.weatherTitle}>{t("diary.manualWeatherTitle")}</Text>
            <Text style={styles.weatherHint}>{t("diary.manualWeatherHint")}</Text>
          </View>
        </View>
        {manualWeatherOpen ? (
          <View style={styles.manualWeatherFields}>
            <TextField
              label={t("diary.temperature")}
              value={manualTemperature}
              onChangeText={setManualTemperature}
              keyboardType="decimal-pad"
              placeholder="18"
            />
            <TextField
              label={t("diary.weatherDescription")}
              value={manualDescription}
              onChangeText={setManualDescription}
              placeholder={t("diary.weatherDescriptionPlaceholder")}
              maxLength={80}
            />
            <TextField
              label={t("diary.windSpeed")}
              value={manualWind}
              onChangeText={setManualWind}
              keyboardType="decimal-pad"
              placeholder="12"
            />
            <TextField
              label={t("diary.precipitation")}
              value={manualPrecipitation}
              onChangeText={setManualPrecipitation}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <PrimaryButton title={t("diary.useManualWeather")} onPress={saveManualWeather} />
          </View>
        ) : (
          <PrimaryButton
            title={t("diary.enterWeatherManually")}
            onPress={() => setManualWeatherOpen(true)}
          />
        )}
      </Card>
      <TextArea
        label={t("diary.note")}
        value={note}
        onChangeText={setNote}
        maxLength={300}
        placeholder={t("diary.notePlaceholder")}
        error={error && error.includes("300") ? error : undefined}
      />
      <DashedUploadBox
        title={
          attachment
            ? (attachment.localUri.split("/").pop() ?? t("diary.addPhoto"))
            : t("diary.addPhoto")
        }
        hint={t("diary.photoLimit")}
        onPress={choosePhoto}
      />
      {attachment ? (
        <Image
          accessibilityLabel={t("diary.addPhoto")}
          source={{ uri: attachment.localUri }}
          style={styles.thumbnail}
        />
      ) : null}
      <EvidenceStrip
        gps={gps}
        weather={weather}
        capturedAt={capturedAt}
        photoCount={attachment ? 1 : 0}
      />
      {weather?.status === "failed" ? (
        <Text style={styles.warning}>{t("errors.weather")}</Text>
      ) : null}
      {error &&
      !error.includes("500") &&
      !error.includes("300") &&
      error !== t("errors.workRequired") &&
      error !== t("dayClosure.correctionReasonRequired") ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
      <PrimaryButton
        title={t("diary.save")}
        icon={CheckCircle2}
        onPress={() => void save()}
        disabled={saving || voiceListening}
      />
    </ScreenShell>
  );
}
const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  date: { color: colors.text, fontSize: 15, fontWeight: "700" },
  field: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 13, fontWeight: "700" },
  correctionCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    gap: spacing.sm,
  },
  correctionTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  warning: { color: colors.warning, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13 },
  thumbnail: { height: 160, width: "100%", borderRadius: 12 },
  weatherCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#2B6F95",
    backgroundColor: "#F7FBFD",
  },
  weatherHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  weatherHeaderText: { flex: 1, gap: 3 },
  weatherTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  weatherHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  manualWeatherFields: { gap: spacing.md },
});
