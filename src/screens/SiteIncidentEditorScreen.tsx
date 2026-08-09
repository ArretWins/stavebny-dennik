import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, Camera } from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
} from "@/components/ui";
import { createId, nowIso } from "@/domain/ids";
import type {
  Attachment,
  SiteIncidentSeverity,
  SiteIncidentType,
} from "@/domain/types";
import { validateSiteIncident } from "@/domain/siteIncidents";
import { pickPhoto, type PhotoSource } from "@/services/attachments";
import { useApp } from "@/state/app";
import { colors, spacing } from "@/theme/tokens";
import { t } from "@/i18n";

const types: SiteIncidentType[] = [
  "near_miss",
  "injury",
  "property_damage",
  "environmental",
  "safety_observation",
];
const severities: SiteIncidentSeverity[] = [
  "low",
  "moderate",
  "serious",
  "critical",
];
const labels = {
  near_miss: "Near miss",
  injury: "Úraz",
  property_damage: "Škoda na majetku",
  environmental: "Environmentálna udalosť",
  safety_observation: "Bezpečnostný postreh",
  low: "Nízka",
  moderate: "Stredná",
  serious: "Vážna",
  critical: "Kritická",
};
export function SiteIncidentEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { incidentId?: string } };
}) {
  const { selectedProject, state, saveSiteIncident, addAttachment } = useApp();
  const existing = state.siteIncidents.find(
    (x) => x.id === route.params?.incidentId,
  );
  const id = useMemo(
    () => existing?.id ?? createId("incident"),
    [existing?.id],
  );
  const [type, setType] = useState<SiteIncidentType>(
    existing?.incidentType ?? "near_miss",
  );
  const [severity, setSeverity] = useState<SiteIncidentSeverity>(
    existing?.severity ?? "moderate",
  );
  const [occurredAt, setOccurredAt] = useState(
    existing?.occurredAt ?? nowIso(),
  );
  const [location, setLocation] = useState(existing?.location ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [action, setAction] = useState(existing?.immediateAction ?? "");
  const [people, setPeople] = useState(existing?.peopleInvolved ?? "");
  const [reporter, setReporter] = useState(
    existing?.reporterName ?? "Stavbyvedúci",
  );
  const [photo, setPhoto] = useState<Attachment>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar title="Hlásenie udalosti" onBack={() => navigation.goBack()} />
        <EmptyState title="Najprv vyberte projekt." />
      </ScreenShell>
    );
  const choose = async (source: PhotoSource) => {
    try {
      const item = await pickPhoto(
        state.activeUserId ?? "",
        selectedProject.id,
        "site_incident",
        source,
        id,
      );
      if (item) setPhoto(item);
    } catch {
      Alert.alert("Fotografiu sa nepodarilo načítať.");
    }
  };
  const save = async () => {
    const input = {
      id,
      projectId: selectedProject.id,
      reporterName: reporter,
      incidentType: type,
      severity,
      occurredAt,
      location,
      description,
      immediateAction: action || undefined,
      peopleInvolved: people || undefined,
      attachmentId: photo?.id ?? existing?.attachmentId,
    };
    if (validateSiteIncident(input) !== "ok") {
      setError("Skontrolujte čas, miesto a popis (minimálne 10 znakov).");
      return;
    }
    setBusy(true);
    try {
      if (photo) await addAttachment(photo);
      await saveSiteIncident(input);
      navigation.goBack();
    } catch {
      Alert.alert("Udalosť sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScreenShell>
      <TopBar
        title={existing ? "Upraviť hlásenie" : "Nové hlásenie"}
        onBack={() => navigation.goBack()}
      />
      <Card style={s.form}>
        <Text style={s.kicker}>{t("siteIncidents.evidenceRecord")}</Text>
        <Text style={s.label}>{t("siteIncidents.type")}</Text>
        <View style={s.wrap}>
          {types.map((x) => (
            <Chip
              key={x}
              active={type === x}
              label={labels[x]}
              onPress={() => setType(x)}
            />
          ))}
        </View>
        <Text style={s.label}>{t("siteIncidents.severity")}</Text>
        <View style={s.wrap}>
          {severities.map((x) => (
            <Chip
              key={x}
              active={severity === x}
              danger={x === "serious" || x === "critical"}
              label={labels[x]}
              onPress={() => setSeverity(x)}
            />
          ))}
        </View>
        <TextField
          label="Dátum a čas (ISO)"
          value={occurredAt}
          onChangeText={setOccurredAt}
        />
        <TextField
          label="Miesto"
          value={location}
          onChangeText={setLocation}
          maxLength={160}
        />
        <TextField
          label="Nahlásil"
          value={reporter}
          onChangeText={setReporter}
          maxLength={160}
        />
        <TextArea
          label="Čo sa stalo"
          value={description}
          onChangeText={setDescription}
          placeholder="Vecný opis udalosti…"
          maxLength={2000}
        />
        <TextArea
          label="Okamžité opatrenie"
          value={action}
          onChangeText={setAction}
          placeholder="Čo bolo urobené ihneď…"
          maxLength={1000}
        />
        <TextArea
          label="Zúčastnené osoby"
          value={people}
          onChangeText={setPeople}
          placeholder="Voliteľné"
          maxLength={500}
        />
        <View style={s.row}>
          <SecondaryButton
            title="Galéria"
            icon={Camera}
            onPress={() => void choose("library")}
            style={s.flex}
          />
          <SecondaryButton
            title="Fotoaparát"
            icon={Camera}
            onPress={() => void choose("camera")}
            style={s.flex}
          />
        </View>
        {photo ? (
          <Text style={s.ok}>{t("siteIncidents.photoReady")}</Text>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <PrimaryButton
          title="Uložiť hlásenie"
          icon={Check}
          disabled={busy || existing?.status === "resolved"}
          onPress={() => void save()}
        />
      </Card>
    </ScreenShell>
  );
}
function Chip({
  label,
  active,
  danger,
  onPress,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, active && s.active, danger && active && s.danger]}
    >
      <Text style={[s.chipText, active && s.activeText]}>{label}</Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  form: { borderTopWidth: 6, borderTopColor: "#172337" },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: "#172337",
  },
  label: { fontSize: 12, fontWeight: "800", color: colors.text },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  active: { backgroundColor: "#172337", borderColor: "#172337" },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  activeText: { color: colors.surface },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  ok: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 12, fontWeight: "700" },
});
