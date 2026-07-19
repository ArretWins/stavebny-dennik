import React, { useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { Download, Trash2 } from "lucide-react-native";
import { Card, DangerActionButton, PrimaryButton, ScreenShell, TextField, TopBar } from "@/components/ui";
import { t } from "@/i18n";
import { deleteAccountPermanently, exportAccountData } from "@/services/accountData";
import { useApp } from "@/state/app";
import { useAuth } from "@/state/auth";
import { colors } from "@/theme/tokens";

export function PrivacyScreen({ navigation }: { navigation: any }) {
  const { state } = useApp();
  const { signOut } = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const exportData = async () => {
    setBusy(true);
    try { await exportAccountData(state); setNotice(t("privacy.exportReady")); }
    catch { setNotice(t("privacy.actionFailed")); }
    finally { setBusy(false); }
  };
  const requestDelete = () => Alert.alert(t("privacy.deleteTitle"), t("privacy.deleteWarning"), [
    { text: t("app.cancel"), style: "cancel" },
    { text: t("privacy.deleteAction"), style: "destructive", onPress: async () => {
      setBusy(true);
      try { await deleteAccountPermanently(); await signOut(); }
      catch { setNotice(t("privacy.actionFailed")); setBusy(false); }
    } },
  ]);
  return (
    <ScreenShell>
      <TopBar title={t("privacy.title")} onBack={() => navigation.goBack()} />
      <Card>
        <Text style={styles.heading}>{t("privacy.policyTitle")}</Text>
        <Text style={styles.text}>{t("privacy.policyBody")}</Text>
      </Card>
      <Card>
        <Text style={styles.heading}>{t("privacy.exportTitle")}</Text>
        <Text style={styles.text}>{t("privacy.exportHint")}</Text>
        <PrimaryButton title={t("privacy.exportAction")} icon={Download} disabled={busy} onPress={() => void exportData()} />
      </Card>
      <Card style={styles.dangerCard}>
        <Text style={styles.heading}>{t("privacy.deleteTitle")}</Text>
        <Text style={styles.text}>{t("privacy.deleteHint")}</Text>
        <TextField label={t("privacy.confirmLabel")} value={confirmation} autoCapitalize="characters" onChangeText={setConfirmation} placeholder={t("privacy.confirmWord")} />
        <DangerActionButton title={t("privacy.deleteAction")} icon={Trash2} disabled={busy || confirmation !== "ODSTRÁNIŤ"} onPress={requestDelete} />
      </Card>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </ScreenShell>
  );
}
const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 17, fontWeight: "800" },
  text: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  dangerCard: { borderColor: colors.danger },
  notice: { color: colors.primary, fontSize: 14, fontWeight: "700" },
});
