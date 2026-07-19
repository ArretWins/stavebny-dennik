import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "./ui";
import { recordClientError } from "@/services/monitoring";
import { colors, spacing } from "@/theme/tokens";
import { t } from "@/i18n";

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    void recordClientError({
      source: "app",
      severity: "fatal",
      error,
      safeMessage: "Aplikácia zobrazila núdzovú obrazovku.",
      context: { operation: "react_render" },
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t("errors.boundaryTitle")}</Text>
        <Text style={styles.text}>{t("errors.boundaryHint")}</Text>
        <PrimaryButton title={t("app.retry")} onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.surfaceAlt },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  text: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
});
