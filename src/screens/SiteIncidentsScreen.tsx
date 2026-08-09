import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  ShieldAlert,
  RotateCcw,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TopBar,
  WarningActionButton,
} from "@/components/ui";
import type { SiteIncident } from "@/domain/types";
import { incidentNeedsImmediateAction } from "@/domain/siteIncidents";
import { formatDateTime } from "@/i18n/format";
import { useApp } from "@/state/app";
import { colors, spacing } from "@/theme/tokens";
import { t } from "@/i18n";
const severityLabel = {
    low: "NÍZKA",
    moderate: "STREDNÁ",
    serious: "VÁŽNA",
    critical: "KRITICKÁ",
  },
  statusLabel = {
    reported: "NAHLÁSENÉ",
    investigating: "VYŠETROVANIE",
    resolved: "UZAVRETÉ",
  };
export function SiteIncidentsScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    refreshProjectData,
    startSiteIncidentInvestigation,
    resolveSiteIncident,
    reopenSiteIncident,
  } = useApp();
  const [selected, setSelected] = useState<SiteIncident>();
  const [root, setRoot] = useState("");
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    void refreshProjectData().catch(() => undefined);
  }, [refreshProjectData, selectedProject?.id]);
  const items = useMemo(
    () =>
      state.siteIncidents
        .filter((x) => x.projectId === selectedProject?.id)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [selectedProject?.id, state.siteIncidents],
  );
  const open = items.filter((x) => x.status !== "resolved");
  const urgent = open.filter((x) => incidentNeedsImmediateAction(x));
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title="Udalosti a near miss"
          onBack={() => navigation.goBack()}
        />
        <EmptyState title="Najprv vyberte projekt." />
      </ScreenShell>
    );
  const confirmStart = (item: SiteIncident) =>
    Alert.alert(
      "Začať vyšetrovanie?",
      "Táto zmena sa zapíše do nemennej histórie.",
      [
        { text: "Zrušiť", style: "cancel" },
        {
          text: "Potvrdiť",
          onPress: () =>
            void startSiteIncidentInvestigation(item.id).catch(() =>
              Alert.alert("Operácia zlyhala."),
            ),
        },
      ],
    );
  const confirmResolve = () =>
    selected &&
    Alert.alert(
      "Uzavrieť udalosť?",
      "Potvrdzujete príčinu a nápravné opatrenie. Záznam zostane v histórii.",
      [
        { text: "Zrušiť", style: "cancel" },
        {
          text: "Uzavrieť",
          onPress: () =>
            void resolveSiteIncident(selected.id, root, action)
              .then(() => {
                setSelected(undefined);
                setRoot("");
                setAction("");
              })
              .catch(() => Alert.alert("Doplňte príčinu aj opatrenie.")),
        },
      ],
    );
  const confirmReopen = () =>
    selected &&
    Alert.alert("Znovu otvoriť?", "Dôvod bude uložený do histórie.", [
      { text: "Zrušiť", style: "cancel" },
      {
        text: "Otvoriť",
        onPress: () =>
          void reopenSiteIncident(selected.id, reason)
            .then(() => {
              setSelected(undefined);
              setReason("");
            })
            .catch(() => Alert.alert("Uveďte dôvod.")),
      },
    ]);
  return (
    <ScreenShell>
      <TopBar title="Udalosti a near miss" onBack={() => navigation.goBack()} />
      <Card style={s.hero}>
        <View style={s.row}>
          <ShieldAlert color="#FFB547" size={34} />
          <View style={s.flex}>
            <Text style={s.heroTitle}>{t("siteIncidents.ledger")}</Text>
            <Text style={s.heroText}>{t("siteIncidents.intro")}</Text>
          </View>
        </View>
        <View style={s.metrics}>
          <Metric value={open.length} label="otvorené" />
          <Metric value={urgent.length} label="urgentné" />
          <Metric
            value={items.filter((x) => x.status === "resolved").length}
            label="uzavreté"
          />
        </View>
      </Card>
      <PrimaryButton
        title="Nahlásiť udalosť"
        icon={Plus}
        onPress={() => navigation.navigate("SiteIncidentEditor")}
      />
      {selected?.status === "investigating" ? (
        <Card style={s.investigation}>
          <Text style={s.cardTitle}>{t("siteIncidents.investigationConclusion")}</Text>
          <TextArea
            label="Koreňová príčina"
            value={root}
            onChangeText={setRoot}
            placeholder="Prečo k udalosti došlo…"
            maxLength={2000}
          />
          <TextArea
            label="Nápravné opatrenie"
            value={action}
            onChangeText={setAction}
            placeholder="Čo zabráni opakovaniu…"
            maxLength={2000}
          />
          <WarningActionButton
            title="Potvrdiť a uzavrieť"
            icon={CheckCircle2}
            onPress={confirmResolve}
          />
          <SecondaryButton
            title="Zrušiť"
            onPress={() => setSelected(undefined)}
          />
        </Card>
      ) : null}
      {selected?.status === "resolved" ? (
        <Card style={s.investigation}>
          <TextArea
            label="Dôvod znovuotvorenia"
            value={reason}
            onChangeText={setReason}
            placeholder="Čo si vyžaduje ďalšie vyšetrovanie…"
            maxLength={500}
          />
          <WarningActionButton
            title="Znovu otvoriť"
            icon={RotateCcw}
            onPress={confirmReopen}
          />
          <SecondaryButton
            title="Zrušiť"
            onPress={() => setSelected(undefined)}
          />
        </Card>
      ) : null}
      {items.map((item) => (
        <Card
          key={item.id}
          style={{
            ...s.incident,
            borderLeftColor:
              item.severity === "critical" || item.severity === "serious"
                ? colors.danger
                : item.severity === "moderate"
                  ? colors.warning
                  : colors.primary,
          }}
        >
          <View style={s.row}>
            <View style={s.flex}>
              <Text style={s.badge}>
                {severityLabel[item.severity]} · {statusLabel[item.status]}
              </Text>
              <Text style={s.cardTitle}>{item.description}</Text>
              <Text style={s.meta}>
                {formatDateTime(item.occurredAt)} · {item.location}
              </Text>
              <Text style={s.meta}>Nahlásil: {item.reporterName}</Text>
            </View>
            {incidentNeedsImmediateAction(item) ? (
              <AlertTriangle color={colors.danger} size={25} />
            ) : null}
          </View>
          {item.immediateAction ? (
            <Text style={s.action}>
              Okamžité opatrenie: {item.immediateAction}
            </Text>
          ) : null}
          {item.rootCause ? (
            <View style={s.finding}>
              <Text style={s.findingTitle}>{t("siteIncidents.rootCause")}</Text>
              <Text style={s.body}>{item.rootCause}</Text>
              <Text style={s.findingTitle}>{t("siteIncidents.correctiveAction")}</Text>
              <Text style={s.body}>{item.correctiveAction}</Text>
            </View>
          ) : null}
          <View style={s.timeline}>
            {state.siteIncidentEvents
              .filter((e) => e.incidentId === item.id)
              .map((e) => (
                <Text key={e.id} style={s.timelineText}>
                  ● {formatDateTime(e.createdAt)} · {e.eventType}
                  {e.body ? ` · ${e.body}` : ""}
                </Text>
              ))}
          </View>
          {item.status === "reported" ? (
            <WarningActionButton
              title="Začať vyšetrovanie"
              icon={Search}
              onPress={() => confirmStart(item)}
            />
          ) : item.status === "investigating" ? (
            <PrimaryButton
              title="Zapísať záver"
              icon={CheckCircle2}
              onPress={() => setSelected(item)}
            />
          ) : (
            <SecondaryButton
              title="Znovu otvoriť"
              icon={RotateCcw}
              onPress={() => setSelected(item)}
            />
          )}{" "}
          {item.status !== "resolved" ? (
            <SecondaryButton
              title="Upraviť údaje"
              onPress={() =>
                navigation.navigate("SiteIncidentEditor", {
                  incidentId: item.id,
                })
              }
            />
          ) : null}
        </Card>
      ))}
      {!items.length ? (
        <EmptyState
          title="Zatiaľ bez hlásení"
          hint="Pracovníci ich môžu odoslať aj cez svoj QR portál."
        />
      ) : null}
    </ScreenShell>
  );
}
function Metric({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  hero: { backgroundColor: "#172337", borderColor: "#172337" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  heroTitle: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1,
  },
  heroText: { color: "#C9D1DC", fontSize: 12, lineHeight: 18 },
  metrics: { flexDirection: "row", gap: spacing.sm },
  metric: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#3B485B",
    paddingTop: spacing.sm,
  },
  metricValue: { color: "#FFF", fontSize: 24, fontWeight: "900" },
  metricLabel: { color: "#C9D1DC", fontSize: 10 },
  incident: { borderLeftWidth: 7 },
  badge: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
  },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  action: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: colors.warningSoft,
    padding: spacing.sm,
  },
  finding: {
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  findingTitle: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    color: colors.primaryDark,
  },
  body: { color: colors.text, fontSize: 12, lineHeight: 18 },
  timeline: {
    borderLeftWidth: 2,
    borderLeftColor: "#AEB8C5",
    paddingLeft: spacing.md,
    gap: spacing.xs,
  },
  timelineText: { fontSize: 10, color: colors.textMuted },
  investigation: { borderTopWidth: 6, borderTopColor: colors.warning },
});
