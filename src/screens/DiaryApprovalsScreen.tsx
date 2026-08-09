import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, FileCheck2, Link2, Share2, ShieldAlert } from "lucide-react-native";
import {
  Card,
  DangerActionButton,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextField,
  TopBar,
} from "@/components/ui";
import {
  diaryApprovalEffectiveStatus,
  diaryApprovalRoleKey,
} from "@/domain/diaryApprovals";
import type {
  CreatedDiaryApprovalRequest,
  DayClosureRecord,
  DiaryApprovalRole,
} from "@/domain/types";
import { t } from "@/i18n";
import { formatDate, formatDateTime } from "@/i18n/format";
import {
  createDiaryApprovalRequest,
  revokeDiaryApprovalRequest,
} from "@/services/diaryApprovalRepository";
import { supabase } from "@/services/supabase";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

const roles: DiaryApprovalRole[] = [
  "technical_supervisor",
  "investor",
  "designer",
  "contractor",
  "other",
];
const expiries = [24, 168, 720] as const;

function expiryLabel(hours: number): string {
  if (hours === 24) return t("diaryApproval.expiry24h");
  if (hours === 720) return t("diaryApproval.expiry30d");
  return t("diaryApproval.expiry7d");
}

function latestClosures(closures: DayClosureRecord[]): DayClosureRecord[] {
  const byDate = new Map<string, DayClosureRecord>();
  for (const closure of closures) {
    const previous = byDate.get(closure.logDate);
    if (!previous || closure.version > previous.version)
      byDate.set(closure.logDate, closure);
  }
  return [...byDate.values()].sort((a, b) =>
    b.logDate.localeCompare(a.logDate),
  );
}

export function DiaryApprovalsScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, refreshProjectData } = useApp();
  const closures = useMemo(
    () =>
      latestClosures(
        state.dayClosures.filter(
          (item) =>
            item.projectId === selectedProject?.id && item.syncStatus === "synced",
        ),
      ),
    [selectedProject?.id, state.dayClosures],
  );
  const requests = useMemo(
    () =>
      state.diaryApprovalRequests
        .filter((item) => item.projectId === selectedProject?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [selectedProject?.id, state.diaryApprovalRequests],
  );
  const [closureId, setClosureId] = useState<string>();
  const [recipientName, setRecipientName] = useState("");
  const [role, setRole] = useState<DiaryApprovalRole>("technical_supervisor");
  const [expiresHours, setExpiresHours] = useState<number>(168);
  const [created, setCreated] = useState<CreatedDiaryApprovalRequest>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!closureId && closures[0]) setClosureId(closures[0].id);
  }, [closureId, closures]);
  useEffect(() => {
    void refreshProjectData().catch(() => undefined);
  }, [refreshProjectData, selectedProject?.id]);

  const selectedClosure = closures.find((item) => item.id === closureId);

  const create = async () => {
    if (!selectedClosure || recipientName.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await createDiaryApprovalRequest({
        closureId: selectedClosure.id,
        recipientName: recipientName.trim(),
        reviewerRole: role,
        expiresHours,
      });
      setCreated(result);
      setRecipientName("");
      await refreshProjectData();
    } catch {
      Alert.alert(t("diaryApproval.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  const confirmCreate = () => {
    if (!selectedClosure || recipientName.trim().length < 2) return;
    Alert.alert(
      t("diaryApproval.confirmTitle"),
      t("diaryApproval.confirmHint", {
        date: formatDate(selectedClosure.logDate),
      }),
      [
        { text: t("app.cancel"), style: "cancel" },
        { text: t("diaryApproval.create"), onPress: () => void create() },
      ],
    );
  };

  const revoke = (id: string) =>
    Alert.alert(t("diaryApproval.revokeTitle"), t("diaryApproval.revokeHint"), [
      { text: t("app.cancel"), style: "cancel" },
      {
        text: t("diaryApproval.revoke"),
        style: "destructive",
        onPress: () => {
          void revokeDiaryApprovalRequest(id)
            .then(refreshProjectData)
            .catch(() => Alert.alert(t("errors.generic")));
        },
      },
    ]);

  if (!selectedProject)
    return (
      <ScreenShell>
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );

  return (
    <ScreenShell>
      <TopBar title={t("diaryApproval.title")} onBack={() => navigation.goBack()} />
      <Card>
        <View style={styles.noticeRow}>
          <FileCheck2 color={colors.primary} size={28} />
          <Text style={styles.body}>{t("diaryApproval.intro")}</Text>
        </View>
        <View style={styles.legalRow}>
          <ShieldAlert color={colors.warning} size={21} />
          <Text style={styles.legal}>{t("diaryApproval.legalNotice")}</Text>
        </View>
      </Card>

      {!supabase ? (
        <Card><Text style={styles.legal}>{t("diaryApproval.onlineOnly")}</Text></Card>
      ) : null}

      {closures.length ? (
        <>
          <Text style={styles.section}>{t("diaryApproval.closure")}</Text>
          <View style={styles.options}>
            {closures.slice(0, 14).map((closure) => (
              <Pressable
                key={closure.id}
                accessibilityState={{ selected: closure.id === closureId }}
                onPress={() => setClosureId(closure.id)}
                style={[styles.option, closure.id === closureId && styles.optionSelected]}
              >
                <Text style={[styles.optionText, closure.id === closureId && styles.optionTextSelected]}>
                  {formatDate(closure.logDate)} · {t("diaryApproval.version", { version: closure.version })}
                </Text>
              </Pressable>
            ))}
          </View>
          {selectedClosure ? (
            <Text selectable style={styles.hash}>
              {t("diaryApproval.hash", { hash: selectedClosure.contentHash })}
            </Text>
          ) : null}
          <TextField
            label={t("diaryApproval.recipient")}
            placeholder={t("diaryApproval.recipientPlaceholder")}
            value={recipientName}
            maxLength={120}
            autoCapitalize="words"
            onChangeText={setRecipientName}
          />
          <Text style={styles.section}>{t("diaryApproval.role")}</Text>
          <View style={styles.options}>
            {roles.map((item) => (
              <Pressable key={item} onPress={() => setRole(item)} style={[styles.option, role === item && styles.optionSelected]}>
                <Text style={[styles.optionText, role === item && styles.optionTextSelected]}>{t(diaryApprovalRoleKey(item))}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.section}>{t("diaryApproval.expiry")}</Text>
          <View style={styles.options}>
            {expiries.map((hours) => (
              <Pressable key={hours} onPress={() => setExpiresHours(hours)} style={[styles.option, expiresHours === hours && styles.optionSelected]}>
                <Text style={[styles.optionText, expiresHours === hours && styles.optionTextSelected]}>{expiryLabel(hours)}</Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            title={t("diaryApproval.create")}
            icon={Link2}
            disabled={busy || !supabase || recipientName.trim().length < 2}
            onPress={confirmCreate}
          />
        </>
      ) : (
        <EmptyState title={t("diaryApproval.noClosures")} hint={t("diaryApproval.noClosuresHint")} />
      )}

      {created ? (
        <Card>
          <Text style={styles.section}>{t("diaryApproval.created")}</Text>
          <Text style={styles.meta}>{t("diaryApproval.createdHint")}</Text>
          <Text selectable style={styles.link}>{created.url}</Text>
          <SecondaryButton title={t("diaryApproval.copy")} icon={Copy} onPress={() => void Clipboard.setStringAsync(created.url).then(() => Alert.alert(t("diaryApproval.copied")))} />
          <PrimaryButton title={t("diaryApproval.share")} icon={Share2} onPress={() => void Share.share({ message: created.url })} />
        </Card>
      ) : null}

      <Text style={styles.section}>{t("diaryApproval.history")}</Text>
      {requests.map((request) => {
        const status = diaryApprovalEffectiveStatus(request);
        const closure = state.dayClosures.find((item) => item.id === request.closureId);
        return (
          <Card key={request.id}>
            <View style={styles.historyHeader}>
              <View style={styles.flex}>
                <Text style={styles.name}>{request.recipientName}</Text>
                <Text style={styles.meta}>{t(diaryApprovalRoleKey(request.reviewerRole))}</Text>
              </View>
              <Text style={[styles.status, (status === "approved") && styles.statusGood, (status === "changes_requested") && styles.statusBad]}>
                {t(`diaryApproval.statuses.${status}`)}
              </Text>
            </View>
            <Text style={styles.meta}>
              {closure ? `${formatDate(closure.logDate)} · ${t("diaryApproval.version", { version: closure.version })}` : request.closureId}
            </Text>
            <Text style={styles.meta}>{t("diaryApproval.views", { count: request.viewCount })}</Text>
            {request.decidedAt ? <Text style={styles.meta}>{t("diaryApproval.decidedAt", { date: formatDateTime(request.decidedAt) })}</Text> : null}
            {request.decisionComment ? <Text style={styles.comment}>{t("diaryApproval.comment", { comment: request.decisionComment })}</Text> : null}
            <Text selectable style={styles.hash}>{t("diaryApproval.hash", { hash: request.closureHash })}</Text>
            {status === "pending" ? <DangerActionButton title={t("diaryApproval.revoke")} onPress={() => revoke(request.id)} /> : null}
          </Card>
        );
      })}
      {!requests.length ? <EmptyState title={t("diaryApproval.empty")} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  noticeRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  legalRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: colors.warningSoft, padding: spacing.md, borderRadius: radius.md },
  body: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  legal: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  section: { color: colors.text, fontSize: 16, fontWeight: "700" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  option: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  optionTextSelected: { color: colors.primaryDark },
  hash: { color: colors.textMuted, fontSize: 10, lineHeight: 15 },
  link: { color: colors.primaryDark, fontSize: 12, lineHeight: 18 },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  name: { color: colors.text, fontSize: 15, fontWeight: "700" },
  historyHeader: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  flex: { flex: 1 },
  status: { color: colors.warning, fontSize: 11, fontWeight: "700", maxWidth: 130, textAlign: "right" },
  statusGood: { color: colors.primary },
  statusBad: { color: colors.danger },
  comment: { color: colors.text, fontSize: 13, lineHeight: 19, backgroundColor: colors.surfaceAlt, padding: spacing.sm, borderRadius: radius.sm },
});
