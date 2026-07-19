import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Card, PrimaryButton, ScreenShell, TextArea, TextField, TopBar } from "@/components/ui";
import { t } from "@/i18n";
import { submitSupportReport } from "@/services/monitoring";
import { useApp } from "@/state/app";
import { colors } from "@/theme/tokens";

export function SupportScreen({ navigation }: { navigation: any }) {
  const { state, selectedProject, pendingCount } = useApp();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"success" | "error">();
  const failedCount = state.outbox.filter((item) => item.status === "failed").length;
  const send = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      await submitSupportReport(subject, description, {
        pendingCount,
        failedCount,
        projectId: selectedProject?.id,
        operation: "user_report",
      });
      setSubject("");
      setDescription("");
      setMessage("success");
    } catch {
      setMessage("error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScreenShell>
      <TopBar title={t("support.title")} onBack={() => navigation.goBack()} />
      <Card>
        <Text style={styles.note}>{t("support.privacyHint")}</Text>
        <TextField label={t("support.subject")} value={subject} maxLength={120} onChangeText={setSubject} />
        <TextArea label={t("support.description")} value={description} maxLength={2000} onChangeText={setDescription} placeholder={t("support.descriptionPlaceholder")} />
        {message ? <Text style={message === "success" ? styles.success : styles.error}>{t(message === "success" ? "support.sent" : "support.failed")}</Text> : null}
        <PrimaryButton title={t("support.send")} disabled={busy || subject.trim().length < 3 || description.trim().length < 10} onPress={() => void send()} />
      </Card>
    </ScreenShell>
  );
}
const styles = StyleSheet.create({
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  success: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 14, fontWeight: "700" },
});
