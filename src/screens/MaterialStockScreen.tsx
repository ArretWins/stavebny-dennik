import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  Boxes,
  Check,
  MinusCircle,
  Plus,
  X,
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
import { calculateMaterialStock } from "@/domain/materialStock";
import type { MaterialStockMovement } from "@/domain/types";
import { t } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

const healthColor = (health: string) =>
  health === "negative" || health === "empty"
    ? colors.danger
    : health === "low"
      ? colors.warning
      : colors.primary;

export function MaterialStockScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    refreshProjectData,
    reviewMaterialStockMovement,
  } = useApp();
  const [rejecting, setRejecting] = useState<MaterialStockMovement>();
  const [reason, setReason] = useState("");
  useEffect(() => {
    void refreshProjectData().catch(() => undefined);
  }, [refreshProjectData, selectedProject?.id]);
  const rows = useMemo(
    () =>
      selectedProject
        ? calculateMaterialStock(
            selectedProject.id,
            state.materialDeliveries,
            state.materialDeliveryLines,
            state.materialStockMovements,
          )
        : [],
    [
      selectedProject,
      state.materialDeliveries,
      state.materialDeliveryLines,
      state.materialStockMovements,
    ],
  );
  const movements = state.materialStockMovements
    .filter((item) => item.projectId === selectedProject?.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const pending = movements.filter((item) => item.status === "reported");
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("materialStock.title")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );
  const confirm = (item: MaterialStockMovement) =>
    Alert.alert(
      t("materialStock.confirmTitle"),
      t("materialStock.confirmHint", {
        quantity: item.quantity,
        unit: item.unit,
        material: item.materialName,
      }),
      [
        { text: t("app.cancel"), style: "cancel" },
        {
          text: t("materialStock.confirm"),
          onPress: () =>
            void reviewMaterialStockMovement(item.id, "confirmed").catch(() =>
              Alert.alert(t("errors.generic")),
            ),
        },
      ],
    );
  const reject = () =>
    rejecting &&
    void reviewMaterialStockMovement(rejecting.id, "rejected", reason)
      .then(() => {
        setRejecting(undefined);
        setReason("");
      })
      .catch(() => Alert.alert(t("materialStock.rejectionRequired")));
  return (
    <ScreenShell>
      <TopBar
        title={t("materialStock.title")}
        onBack={() => navigation.goBack()}
      />
      <Card style={s.hero}>
        <View style={s.heroLine}>
          <Boxes color="#76D6B2" size={34} />
          <View style={s.flex}>
            <Text style={s.heroTitle}>{t("materialStock.ledger")}</Text>
            <Text style={s.heroText}>{t("materialStock.intro")}</Text>
          </View>
        </View>
        <View style={s.summary}>
          <Text style={s.summaryNumber}>{rows.length}</Text>
          <Text style={s.summaryLabel}>{t("materialStock.materialKinds")}</Text>
          <View style={s.rule} />
          <Text
            style={[
              s.summaryNumber,
              { color: pending.length ? "#FFD27A" : "#76D6B2" },
            ]}
          >
            {pending.length}
          </Text>
          <Text style={s.summaryLabel}>{t("materialStock.pending")}</Text>
        </View>
      </Card>
      <PrimaryButton
        title={t("materialStock.addMovement")}
        icon={Plus}
        onPress={() => navigation.navigate("MaterialStockMovement")}
      />
      <SecondaryButton
        title={t("taskMaterials.open")}
        icon={Boxes}
        onPress={() => navigation.navigate("TaskMaterials")}
      />
      {rejecting ? (
        <Card style={s.reject}>
          <Text style={s.sectionTitle}>{t("materialStock.rejectTitle")}</Text>
          <TextArea
            label={t("materialStock.rejectionReason")}
            value={reason}
            onChangeText={setReason}
            placeholder={t("materialStock.rejectionPlaceholder")}
            maxLength={500}
          />
          <WarningActionButton
            title={t("materialStock.reject")}
            onPress={reject}
          />
          <SecondaryButton
            title={t("app.cancel")}
            onPress={() => {
              setRejecting(undefined);
              setReason("");
            }}
          />
        </Card>
      ) : null}
      {pending.length ? (
        <>
          <Text style={s.sectionTitle}>{t("materialStock.pendingReview")}</Text>
          {pending.map((item) => (
            <Card key={item.id} style={s.pendingCard}>
              <View style={s.line}>
                <AlertTriangle color={colors.warning} size={23} />
                <View style={s.flex}>
                  <Text style={s.item}>{item.materialName}</Text>
                  <Text style={s.meta}>
                    {item.workerName ?? t("materialStock.worker")} Â·{" "}
                    {formatDateTime(item.occurredAt)}
                  </Text>
                  <Text style={s.quantity}>
                    {t(`materialStock.type.${item.movementType}`)} Â·{" "}
                    {item.quantity} {item.unit}
                  </Text>
                </View>
              </View>
              {item.note ? <Text style={s.note}>{item.note}</Text> : null}
              <View style={s.actions}>
                <Pressable style={s.approve} onPress={() => confirm(item)}>
                  <Check color="#FFFFFF" size={18} />
                  <Text style={s.actionText}>{t("materialStock.confirm")}</Text>
                </Pressable>
                <Pressable style={s.deny} onPress={() => setRejecting(item)}>
                  <X color={colors.danger} size={18} />
                  <Text style={s.denyText}>{t("materialStock.reject")}</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      ) : null}
      <Text style={s.sectionTitle}>{t("materialStock.currentStock")}</Text>
      {rows.map((row) => {
        const ratio =
          row.availableQuantity > 0
            ? Math.max(
                0,
                Math.min(1, row.balanceQuantity / row.availableQuantity),
              )
            : 0;
        return (
          <Card key={row.requestItemId} style={s.stockCard}>
            <View style={s.line}>
              <View
                style={[s.marker, { backgroundColor: healthColor(row.health) }]}
              />
              <View style={s.flex}>
                <Text style={s.item}>{row.materialName}</Text>
                <Text style={s.meta}>
                  {t(`materialStock.health.${row.health}`)}
                </Text>
              </View>
              <View style={s.amount}>
                <Text style={[s.balance, { color: healthColor(row.health) }]}>
                  {row.balanceQuantity.toLocaleString("sk-SK")}
                </Text>
                <Text style={s.unit}>{row.unit}</Text>
              </View>
            </View>
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  {
                    width: `${ratio * 100}%`,
                    backgroundColor: healthColor(row.health),
                  },
                ]}
              />
            </View>
            <View style={s.metrics}>
              <Text style={s.metric}>
                {t("materialStock.received")}{" "}
                {row.availableQuantity.toLocaleString("sk-SK")}
              </Text>
              <Text style={s.metric}>
                {t("materialStock.used")}{" "}
                {row.usedQuantity.toLocaleString("sk-SK")}
              </Text>
              <Text style={s.metric}>
                {t("materialStock.waste")}{" "}
                {row.wasteQuantity.toLocaleString("sk-SK")}
              </Text>
            </View>
          </Card>
        );
      })}
      {!rows.length ? (
        <EmptyState
          title={t("materialStock.empty")}
          hint={t("materialStock.emptyHint")}
        />
      ) : null}
      {movements.filter((item) => item.status !== "reported").length ? (
        <>
          <Text style={s.sectionTitle}>{t("materialStock.history")}</Text>
          {movements
            .filter((item) => item.status !== "reported")
            .slice(0, 20)
            .map((item) => (
              <View key={item.id} style={s.history}>
                <MinusCircle
                  color={
                    item.status === "rejected"
                      ? colors.textMuted
                      : materialStockDirectionColor(item.movementType)
                  }
                  size={18}
                />
                <View style={s.flex}>
                  <Text style={s.historyTitle}>
                    {item.materialName} Â·{" "}
                    {t(`materialStock.type.${item.movementType}`)}
                  </Text>
                  <Text style={s.meta}>
                    {formatDateTime(item.occurredAt)}
                    {item.workerName ? ` Â· ${item.workerName}` : ""}
                  </Text>
                </View>
                <Text style={s.historyAmount}>
                  {item.quantity} {item.unit}
                </Text>
              </View>
            ))}
        </>
      ) : null}
    </ScreenShell>
  );
}
function materialStockDirectionColor(
  type: MaterialStockMovement["movementType"],
) {
  return type === "return" || type === "adjustment_in"
    ? colors.primary
    : colors.warning;
}
const s = StyleSheet.create({
  hero: { backgroundColor: "#173A36", borderColor: "#173A36", gap: spacing.md },
  heroLine: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  heroText: { color: "#B9D7D0", lineHeight: 20, marginTop: 3 },
  summary: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#31534F",
    paddingTop: spacing.sm,
  },
  summaryNumber: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  summaryLabel: { color: "#B9D7D0", fontSize: 12 },
  rule: { flex: 1 },
  flex: { flex: 1 },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  pendingCard: { borderLeftWidth: 5, borderLeftColor: colors.warning },
  stockCard: { gap: spacing.sm },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  item: { color: colors.text, fontSize: 16, fontWeight: "800" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  quantity: { color: colors.warning, fontWeight: "800", marginTop: 4 },
  note: {
    color: colors.text,
    lineHeight: 20,
    backgroundColor: "#FFF6E3",
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  approve: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: radius.md,
  },
  deny: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: 12,
    borderRadius: radius.md,
  },
  actionText: { color: "#FFFFFF", fontWeight: "800" },
  denyText: { color: colors.danger, fontWeight: "800" },
  reject: { borderColor: colors.danger },
  marker: { width: 8, height: 45, borderRadius: 4 },
  amount: { alignItems: "flex-end" },
  balance: { fontSize: 25, fontWeight: "900" },
  unit: { color: colors.textMuted, fontSize: 12 },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E8ECEA",
    overflow: "hidden",
  },
  fill: { height: 7, borderRadius: 4 },
  metrics: { flexDirection: "row", justifyContent: "space-between" },
  metric: { color: colors.textMuted, fontSize: 11 },
  history: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  historyTitle: { color: colors.text, fontWeight: "700" },
  historyAmount: { color: colors.text, fontWeight: "900" },
});
