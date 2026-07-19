import React from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { Crown, FileWarning, LogOut, ShieldCheck } from "lucide-react-native";
import {
  ScreenShell,
  TopBar,
  Card,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";
import { colors } from "@/theme/tokens";
import { t } from "@/i18n";
import { isSupabaseConfigured } from "@/services/supabase";
import { useAuth } from "@/state/auth";

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { email, signOut } = useAuth();
  return (
    <ScreenShell>
      <TopBar title={t("settings.title")} onBack={() => navigation.goBack()} />
      <Card>
        <Text style={styles.heading}>{t("settings.account")}</Text>
        <Text style={styles.value}>{email}</Text>
        <PrimaryButton
          title={t("settings.signOut")}
          icon={LogOut}
          onPress={() =>
            Alert.alert(t("settings.signOut"), t("app.close"), [
              { text: t("app.cancel"), style: "cancel" },
              { text: t("settings.signOut"), onPress: () => void signOut() },
            ])
          }
        />
      </Card>
      <Card>
        <Text style={styles.heading}>{t("settings.language")}</Text>
        <Text style={styles.value}>{t("settings.slovakOnly")}</Text>
      </Card>
      <Card>
        <Text style={styles.heading}>{t("pilotAccount.title")}</Text>
        <Text style={styles.note}>{t("pilotAccount.settingsHint")}</Text>
        <SecondaryButton
          title={t("pilotAccount.open")}
          icon={Crown}
          onPress={() => navigation.navigate("PilotAccount")}
        />
      </Card>
      <Card>
        <Text style={styles.heading}>{t("settings.limitsTitle")}</Text>
        <Text style={styles.note}>{t("settings.limits")}</Text>
      </Card>
      <Card>
        <Text style={styles.heading}>{t("support.title")}</Text>
        <Text style={styles.note}>{t("support.settingsHint")}</Text>
        <SecondaryButton title={t("support.open")} icon={FileWarning} onPress={() => navigation.navigate("Support")} />
      </Card>
      <Card>
        <Text style={styles.heading}>{t("privacy.title")}</Text>
        <Text style={styles.note}>{t("privacy.settingsHint")}</Text>
        <SecondaryButton title={t("privacy.open")} icon={ShieldCheck} onPress={() => navigation.navigate("Privacy")} />
      </Card>
      {!isSupabaseConfigured ? (
        <Text style={styles.warning}>{t("errors.config")}</Text>
      ) : null}
    </ScreenShell>
  );
}
const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 16, fontWeight: "700" },
  value: { color: colors.text, fontSize: 15 },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  warning: { color: colors.warning, fontSize: 13, lineHeight: 18 },
});
