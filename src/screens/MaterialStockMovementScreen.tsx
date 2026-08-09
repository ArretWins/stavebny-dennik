import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  TextArea,
  TextField,
  TopBar,
} from "@/components/ui";
import {
  calculateMaterialStock,
  validateMaterialStockMovement,
} from "@/domain/materialStock";
import { nowIso } from "@/domain/ids";
import type { MaterialStockMovementType } from "@/domain/types";
import { t } from "@/i18n";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

const types: MaterialStockMovementType[] = [
  "usage",
  "waste",
  "return",
  "adjustment_in",
  "adjustment_out",
];
export function MaterialStockMovementScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { requestItemId?: string } };
}) {
  const { selectedProject, state, saveMaterialStockMovement } = useApp();
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
  const [requestItemId, setRequestItemId] = useState(
    route.params?.requestItemId ?? rows[0]?.requestItemId ?? "",
  );
  const [movementType, setMovementType] =
    useState<MaterialStockMovementType>("usage");
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowIso());
  const [workerId, setWorkerId] = useState<string>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const row = rows.find((item) => item.requestItemId === requestItemId);
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("materialStock.addMovement")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );
  if (!rows.length)
    return (
      <ScreenShell>
        <TopBar
          title={t("materialStock.addMovement")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState
          title={t("materialStock.empty")}
          hint={t("materialStock.emptyHint")}
        />
      </ScreenShell>
    );
  const save = () => {
    if (!row) return;
    const input = {
      projectId: selectedProject.id,
      requestId: row.requestId,
      requestItemId: row.requestItemId,
      materialName: row.materialName,
      unit: row.unit,
      movementType,
      quantity: Number(quantity.replace(",", ".")),
      occurredAt,
      workerId,
      note: note.trim() || undefined,
    };
    if (validateMaterialStockMovement(input) !== "ok") {
      Alert.alert(t("materialStock.validation"));
      return;
    }
    Alert.alert(
      t("materialStock.saveTitle"),
      t("materialStock.saveHint", {
        quantity: input.quantity,
        unit: row.unit,
        material: row.materialName,
      }),
      [
        { text: t("app.cancel"), style: "cancel" },
        {
          text: t("app.save"),
          onPress: () => {
            setBusy(true);
            void saveMaterialStockMovement(input)
              .then(() => navigation.goBack())
              .catch(() => Alert.alert(t("errors.generic")))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };
  return (
    <ScreenShell>
      <TopBar
        title={t("materialStock.addMovement")}
        onBack={() => navigation.goBack()}
      />
      <Card style={s.sheet}>
        <Text style={s.eyebrow}>{t("materialStock.stockDocument")}</Text>
        <Text style={s.intro}>{t("materialStock.formHint")}</Text>
        <Text style={s.label}>{t("materialStock.material")}</Text>
        <View style={s.wrap}>
          {rows.map((item) => (
            <Pressable
              key={item.requestItemId}
              onPress={() => setRequestItemId(item.requestItemId)}
              style={[
                s.choice,
                requestItemId === item.requestItemId && s.choiceActive,
              ]}
            >
              <Text
                style={[
                  s.choiceText,
                  requestItemId === item.requestItemId && s.choiceTextActive,
                ]}
              >
                {item.materialName} Â·{" "}
                {item.balanceQuantity.toLocaleString("sk-SK")} {item.unit}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>{t("materialStock.movementType")}</Text>
        <View style={s.wrap}>
          {types.map((type) => (
            <Pressable
              key={type}
              onPress={() => setMovementType(type)}
              style={[s.choice, movementType === type && s.choiceActive]}
            >
              {movementType === type ? (
                <Check color="#FFFFFF" size={16} />
              ) : null}
              <Text
                style={[
                  s.choiceText,
                  movementType === type && s.choiceTextActive,
                ]}
              >
                {t(`materialStock.type.${type}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextField
          label={t("materialStock.quantity")}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
        />
        <TextField
          label={t("materialStock.occurredAt")}
          value={occurredAt}
          onChangeText={setOccurredAt}
        />
        <Text style={s.label}>{t("materialStock.assignedWorker")}</Text>
        <View style={s.wrap}>
          <Pressable
            onPress={() => setWorkerId(undefined)}
            style={[s.choice, !workerId && s.choiceActive]}
          >
            <Text style={[s.choiceText, !workerId && s.choiceTextActive]}>
              {t("materialStock.noWorker")}
            </Text>
          </Pressable>
          {state.workers
            .filter(
              (item) =>
                item.projectId === selectedProject.id &&
                item.status === "active",
            )
            .map((worker) => (
              <Pressable
                key={worker.id}
                onPress={() => setWorkerId(worker.id)}
                style={[s.choice, workerId === worker.id && s.choiceActive]}
              >
                <Text
                  style={[
                    s.choiceText,
                    workerId === worker.id && s.choiceTextActive,
                  ]}
                >
                  {worker.firstName} {worker.lastName}
                </Text>
              </Pressable>
            ))}
        </View>
        <TextArea
          label={t("materialStock.note")}
          value={note}
          onChangeText={setNote}
          placeholder={t("materialStock.notePlaceholder")}
          maxLength={1000}
        />
        <PrimaryButton
          title={busy ? t("materialStock.saving") : t("materialStock.save")}
          onPress={save}
          disabled={busy}
        />
      </Card>
    </ScreenShell>
  );
}
const s = StyleSheet.create({
  sheet: { borderTopWidth: 5, borderTopColor: "#1E6A5C", gap: spacing.sm },
  eyebrow: {
    color: "#1E6A5C",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  intro: { color: colors.textMuted, lineHeight: 20 },
  label: { color: colors.text, fontWeight: "800", marginTop: spacing.xs },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F6F8F7",
    borderRadius: radius.md,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  choiceActive: { borderColor: "#1E6A5C", backgroundColor: "#1E6A5C" },
  choiceText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  choiceTextActive: { color: "#FFFFFF" },
});
