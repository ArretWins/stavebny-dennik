import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Boxes,
  Check,
  ClipboardList,
  ShieldAlert,
  Store,
  UserPlus,
} from "lucide-react-native";
import { Card, EmptyState, ScreenShell, TopBar } from "@/components/ui";
import { useApp } from "@/state/app";
import { colors, radius, spacing, typeScale } from "@/theme/tokens";
import { formatDateTime } from "@/i18n/format";
import { t } from "@/i18n";

export function NotificationsScreen({ navigation }: { navigation: any }) {
  const { state, readNotification, refreshProjectData } = useApp();
  useEffect(() => {
    void refreshProjectData();
  }, [refreshProjectData]);
  return (
    <ScreenShell>
      <TopBar
        title={t("notifications.title")}
        onBack={() => navigation.goBack()}
      />
      {!state.notifications.length ? (
        <EmptyState
          title={t("notifications.empty")}
          hint={t("notifications.emptyHint")}
        />
      ) : (
        state.notifications.map((item) => {
          const Icon =
            item.type === "worker_join"
              ? UserPlus
              : item.type === "supplier_quote"
                ? Store
                : item.type === "material_stock"
                  ? Boxes
                  : item.type === "site_incident" ||
                      item.type === "material_delivery"
                    ? ShieldAlert
                    : ClipboardList;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => {
                if (!item.readAt) void readNotification(item.id);
                if (
                  item.type === "worker_join" ||
                  item.type === "material_request"
                )
                  navigation.navigate("Workforce");
                else if (item.type === "supplier_quote" && item.data?.requestId)
                  navigation.navigate("MaterialProcurement", {
                    requestId: String(item.data.requestId),
                  });
                else if (item.type === "site_incident")
                  navigation.navigate("SiteIncidents");
                else if (item.type === "material_delivery")
                  navigation.navigate("MaterialDeliveries", {
                    requestId: item.data?.requestId
                      ? String(item.data.requestId)
                      : undefined,
                  });
                else if (item.type === "material_stock")
                  navigation.navigate("MaterialStock");
                else if (item.type === "diary_approval")
                  navigation.navigate("DiaryApprovals");
              }}
            >
              <Card style={item.readAt ? styles.card : styles.unreadCard}>
                <View style={styles.row}>
                  <View
                    style={[styles.icon, !item.readAt && styles.iconUnread]}
                  >
                    <Icon
                      color={!item.readAt ? colors.warning : colors.primary}
                      size={22}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.body}>{item.body}</Text>
                    <Text style={styles.time}>
                      {formatDateTime(item.createdAt)}
                    </Text>
                  </View>
                  {item.readAt ? (
                    <Check color={colors.primary} size={18} />
                  ) : (
                    <View
                      accessibilityLabel={t("notifications.unread")}
                      style={styles.dot}
                    />
                  )}
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, borderLeftColor: colors.border },
  unreadCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  flex: { flex: 1, gap: spacing.xs },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconUnread: { backgroundColor: "#FFE4BC" },
  title: { ...typeScale.section, color: colors.text },
  body: { ...typeScale.body, color: colors.textMuted },
  time: { ...typeScale.meta, color: colors.textMuted },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
    marginTop: spacing.xs,
  },
});
