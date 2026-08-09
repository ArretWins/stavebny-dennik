import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextField,
  TopBar,
} from "@/components/ui";
import { calculateMaterialStock } from "@/domain/materialStock";
import { calculateTaskMaterialReadiness } from "@/domain/materialReservations";
import { t } from "@/i18n";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

export function TaskMaterialsScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { taskId?: string } };
}) {
  const { selectedProject, state, saveTaskMaterialRequirements } = useApp();
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>(
    route.params?.taskId,
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      state.taskMaterialRequirements
        .filter((item) => item.taskId === route.params?.taskId)
        .map((item) => [item.requestItemId, String(item.quantity)]),
    ),
  );
  const [busy, setBusy] = useState(false);
  const tasks = state.siteTasks.filter(
    (task) => task.projectId === selectedProject?.id && task.status !== "done",
  );
  const stock = useMemo(
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
  const readiness = useMemo(
    () =>
      calculateTaskMaterialReadiness(
        tasks,
        state.taskMaterialRequirements,
        stock,
      ),
    [tasks, state.taskMaterialRequirements, stock],
  );
  const edit = (taskId: string) => {
    setEditingTaskId(taskId);
    setQuantities(
      Object.fromEntries(
        state.taskMaterialRequirements
          .filter((item) => item.taskId === taskId)
          .map((item) => [item.requestItemId, String(item.quantity)]),
      ),
    );
  };
  const save = () => {
    if (!editingTaskId) return;
    const requirements = stock.flatMap((row) => {
      const raw = quantities[row.requestItemId]?.trim().replace(",", ".");
      if (!raw) return [];
      const quantity = Number(raw);
      return Number.isFinite(quantity) && quantity > 0
        ? [{ requestItemId: row.requestItemId, quantity }]
        : [];
    });
    if (
      Object.values(quantities).some(
        (value) =>
          value.trim() && !(Number(value.trim().replace(",", ".")) > 0),
      )
    )
      return Alert.alert(
        t("taskMaterials.invalidTitle"),
        t("taskMaterials.invalidHint"),
      );
    Alert.alert(
      t("taskMaterials.confirmTitle"),
      t("taskMaterials.confirmHint"),
      [
        { text: t("app.cancel"), style: "cancel" },
        {
          text: t("app.save"),
          onPress: () => {
            setBusy(true);
            void saveTaskMaterialRequirements(editingTaskId, requirements)
              .then(() => setEditingTaskId(undefined))
              .catch(() =>
                Alert.alert(
                  t("taskMaterials.saveFailed"),
                  t("taskMaterials.saveFailedHint"),
                ),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("taskMaterials.title")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("taskMaterials.noProject")} />
      </ScreenShell>
    );
  const selectedTask = tasks.find((task) => task.id === editingTaskId);
  return (
    <ScreenShell>
      <TopBar
        title={t("taskMaterials.title")}
        onBack={() =>
          editingTaskId ? setEditingTaskId(undefined) : navigation.goBack()
        }
      />
      <Card style={styles.hero}>
        <PackageCheck color="#82DFC0" size={34} />
        <View style={styles.flex}>
          <Text style={styles.heroTitle}>{t("taskMaterials.hero")}</Text>
          <Text style={styles.heroText}>{t("taskMaterials.intro")}</Text>
        </View>
      </Card>
      {selectedTask ? (
        <>
          <Text style={styles.taskTitle}>{selectedTask.title}</Text>
          <Text style={styles.hint}>{t("taskMaterials.instruction")}</Text>
          {stock.map((row) => (
            <Card key={row.requestItemId} style={styles.materialRow}>
              <View style={styles.materialHeader}>
                <View style={styles.flex}>
                  <Text style={styles.materialName}>{row.materialName}</Text>
                  <Text style={styles.available}>
                    {t("taskMaterials.available", {
                      quantity: row.balanceQuantity.toLocaleString("sk-SK"),
                      unit: row.unit,
                    })}
                  </Text>
                </View>
                <TextField
                  label={t("taskMaterials.needed", { unit: row.unit })}
                  value={quantities[row.requestItemId] ?? ""}
                  keyboardType="decimal-pad"
                  onChangeText={(value) =>
                    setQuantities((current) => ({
                      ...current,
                      [row.requestItemId]: value,
                    }))
                  }
                  style={styles.quantityInput}
                />
              </View>
            </Card>
          ))}
          {!stock.length ? (
            <EmptyState
              title={t("taskMaterials.emptyStock")}
              hint={t("taskMaterials.emptyStockHint")}
            />
          ) : null}
          <PrimaryButton
            title={
              busy
                ? t("materialStock.saving")
                : t("taskMaterials.saveConfirmed")
            }
            disabled={busy}
            onPress={save}
          />
          <SecondaryButton
            title={t("app.cancel")}
            onPress={() => setEditingTaskId(undefined)}
          />
        </>
      ) : (
        <>
          <Text style={styles.section}>{t("taskMaterials.readiness")}</Text>
          {tasks.map((task) => {
            const item = readiness.find((entry) => entry.taskId === task.id);
            const hasShortage = (item?.shortageCount ?? 0) > 0;
            return (
              <Pressable key={task.id} onPress={() => edit(task.id)}>
                <Card
                  style={{
                    ...styles.taskCard,
                    ...(hasShortage ? styles.shortageCard : {}),
                  }}
                >
                  <View style={styles.row}>
                    {hasShortage ? (
                      <AlertTriangle color={colors.danger} size={23} />
                    ) : item?.requiredCount ? (
                      <CheckCircle2 color={colors.primary} size={23} />
                    ) : (
                      <ClipboardList color={colors.textMuted} size={23} />
                    )}
                    <View style={styles.flex}>
                      <Text style={styles.taskName}>{task.title}</Text>
                      <Text
                        style={[
                          styles.status,
                          hasShortage && { color: colors.danger },
                        ]}
                      >
                        {hasShortage
                          ? t("taskMaterials.shortage", {
                              count: item?.shortageCount ?? 0,
                            })
                          : item?.requiredCount
                            ? t("taskMaterials.ready", {
                                count: item.requiredCount,
                              })
                            : t("taskMaterials.unplanned")}
                      </Text>
                      {task.dueDate ? (
                        <Text style={styles.due}>
                          {t("taskMaterials.due", { date: task.dueDate })}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.edit}>{t("taskMaterials.edit")}</Text>
                  </View>
                  {item?.allocations.map((allocation) => (
                    <Text key={allocation.id} style={styles.allocation}>
                      {t(
                        allocation.shortageQuantity > 0
                          ? "taskMaterials.lineShortage"
                          : "taskMaterials.lineReady",
                        {
                          material: allocation.materialName,
                          quantity: allocation.quantity,
                          unit: allocation.unit,
                          shortage: allocation.shortageQuantity,
                        },
                      )}
                    </Text>
                  ))}
                </Card>
              </Pressable>
            );
          })}
          {!tasks.length ? (
            <EmptyState
              title={t("taskMaterials.emptyTasks")}
              hint={t("taskMaterials.emptyTasksHint")}
            />
          ) : null}
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    backgroundColor: "#173A36",
    borderColor: "#173A36",
  },
  heroTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  heroText: { color: "#B9D7D0", lineHeight: 19, marginTop: 4 },
  flex: { flex: 1 },
  section: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  taskTitle: { color: colors.text, fontSize: 22, fontWeight: "900" },
  hint: { color: colors.textMuted, lineHeight: 20 },
  taskCard: { borderLeftWidth: 5, borderLeftColor: colors.primary },
  shortageCard: { borderLeftColor: colors.danger, backgroundColor: "#FFF8F6" },
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  taskName: { color: colors.text, fontSize: 16, fontWeight: "800" },
  status: { color: colors.primary, fontWeight: "700", marginTop: 3 },
  due: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  edit: { color: colors.primary, fontWeight: "800" },
  allocation: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 31,
  },
  materialRow: { gap: spacing.sm },
  materialHeader: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  materialName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  available: { color: colors.textMuted, marginTop: 3 },
  quantityInput: { width: 120, borderRadius: radius.sm },
});
