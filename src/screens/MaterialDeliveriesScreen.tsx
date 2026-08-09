import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import {
  CheckCircle2,
  PackageCheck,
  Plus,
  TriangleAlert,
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
import {
  deliveryHasDiscrepancy,
  deliveryVariance,
} from "@/domain/materialDeliveries";
import type { MaterialDelivery } from "@/domain/types";
import { t } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { signedAttachmentUrl } from "@/services/attachments";
import { useApp } from "@/state/app";
import { colors, spacing } from "@/theme/tokens";
function DeliveryPhoto({
  localUri,
  storagePath,
}: {
  localUri: string;
  storagePath?: string;
}) {
  const [uri, setUri] = useState(localUri);
  useEffect(() => {
    let active = true;
    if (storagePath)
      void signedAttachmentUrl(storagePath)
        .then((value) => {
          if (active && value) setUri(value);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [storagePath]);
  return <Image source={{ uri }} style={s.photo} resizeMode="cover" />;
}
export function MaterialDeliveriesScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { requestId?: string } };
}) {
  const {
    selectedProject,
    state,
    reviewMaterialDelivery,
    resolveMaterialDelivery,
    refreshProjectData,
  } = useApp();
  const [resolving, setResolving] = useState<MaterialDelivery>();
  const [resolution, setResolution] = useState("");
  useEffect(() => {
    void refreshProjectData().catch(() => undefined);
  }, [refreshProjectData, selectedProject?.id]);
  const deliveries = useMemo(
    () =>
      state.materialDeliveries
        .filter(
          (x) =>
            x.projectId === selectedProject?.id &&
            (!route.params?.requestId ||
              x.requestId === route.params.requestId),
        )
        .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt)),
    [route.params?.requestId, selectedProject?.id, state.materialDeliveries],
  );
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t("materialDeliveries.title")}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );
  const review = (item: MaterialDelivery) => {
    const lines = state.materialDeliveryLines.filter(
      (x) => x.deliveryId === item.id,
    );
    const issue = deliveryHasDiscrepancy(lines);
    Alert.alert(
      t("materialDeliveries.reviewTitle"),
      t(
        issue
          ? "materialDeliveries.reviewIssue"
          : "materialDeliveries.reviewClean",
      ),
      [
        { text: t("app.cancel"), style: "cancel" },
        {
          text: t("app.save"),
          onPress: () =>
            void reviewMaterialDelivery(item.id).catch(() =>
              Alert.alert(t("errors.generic")),
            ),
        },
      ],
    );
  };
  const resolve = () =>
    resolving &&
    Alert.alert(t("materialDeliveries.resolve"), resolution, [
      { text: t("app.cancel"), style: "cancel" },
      {
        text: t("app.save"),
        onPress: () =>
          void resolveMaterialDelivery(resolving.id, resolution)
            .then(() => {
              setResolving(undefined);
              setResolution("");
            })
            .catch(() => Alert.alert(t("errors.generic"))),
      },
    ]);
  return (
    <ScreenShell>
      <TopBar
        title={t("materialDeliveries.title")}
        onBack={() => navigation.goBack()}
      />
      <Card style={s.hero}>
        <View style={s.row}>
          <PackageCheck color="#E8B84A" size={32} />
          <View style={s.flex}>
            <Text style={s.heroTitle}>{t("materialDeliveries.ledger")}</Text>
            <Text style={s.heroText}>{t("materialDeliveries.intro")}</Text>
          </View>
        </View>
      </Card>
      <PrimaryButton
        title={t("materialDeliveries.new")}
        icon={Plus}
        onPress={() =>
          navigation.navigate("MaterialDeliveryEditor", {
            requestId: route.params?.requestId,
          })
        }
      />
      <SecondaryButton
        title={t("materialStock.open")}
        onPress={() => navigation.navigate("MaterialStock")}
      />
      {resolving ? (
        <Card style={s.resolve}>
          <TextArea
            label={t("materialDeliveries.resolution")}
            value={resolution}
            onChangeText={setResolution}
            placeholder={t("materialDeliveries.resolution")}
            maxLength={1000}
          />
          <WarningActionButton
            title={t("materialDeliveries.resolve")}
            onPress={resolve}
          />
          <SecondaryButton
            title={t("app.cancel")}
            onPress={() => setResolving(undefined)}
          />
        </Card>
      ) : null}
      {deliveries.map((item) => {
        const lines = state.materialDeliveryLines.filter(
          (x) => x.deliveryId === item.id,
        );
        const attachment = state.attachments.find(
          (x) => x.id === item.attachmentId,
        );
        const issues = lines.filter(
          (x) => deliveryVariance(x) !== 0 || x.damagedQuantity > 0,
        ).length;
        return (
          <Card
            key={item.id}
            style={{
              ...s.delivery,
              borderLeftColor:
                item.status === "discrepancy"
                  ? colors.danger
                  : item.status === "reported"
                    ? colors.warning
                    : colors.primary,
            }}
          >
            <View style={s.row}>
              <View style={s.flex}>
                <Text style={s.status}>
                  {t(`materialDeliveries.${item.status}`)}
                </Text>
                <Text style={s.supplier}>{item.supplierName}</Text>
                <Text style={s.meta}>
                  {formatDateTime(item.deliveredAt)} · {item.receiverName}
                </Text>
                {item.deliveryNoteNumber ? (
                  <Text style={s.meta}>DL: {item.deliveryNoteNumber}</Text>
                ) : null}
              </View>
              {issues ? (
                <TriangleAlert color={colors.danger} size={25} />
              ) : (
                <CheckCircle2 color={colors.primary} size={25} />
              )}
            </View>
            <Text style={s.total}>
              {t("materialDeliveries.totals", { count: lines.length, issues })}
            </Text>
            {attachment ? (
              <DeliveryPhoto
                localUri={attachment.localUri}
                storagePath={attachment.storagePath}
              />
            ) : null}
            <View style={s.tableHead}>
              <Text style={s.name}>{t("materialDeliveries.items")}</Text>
              <Text style={s.num}>{t("materialDeliveries.ordered")}</Text>
              <Text style={s.num}>{t("materialDeliveries.delivered")}</Text>
              <Text style={s.num}>{t("materialDeliveries.damaged")}</Text>
              <Text style={s.num}>Δ</Text>
            </View>
            {lines.map((line) => (
              <View key={line.id} style={s.tableRow}>
                <Text style={s.name}>{line.itemName}</Text>
                <Text style={s.num}>{line.expectedQuantity}</Text>
                <Text style={s.num}>{line.deliveredQuantity}</Text>
                <Text style={[s.num, line.damagedQuantity > 0 && s.bad]}>
                  {line.damagedQuantity}
                </Text>
                <Text style={[s.num, deliveryVariance(line) !== 0 && s.bad]}>
                  {deliveryVariance(line) > 0 ? "+" : ""}
                  {deliveryVariance(line)}
                </Text>
              </View>
            ))}
            {item.status === "reported" ? (
              <>
                <WarningActionButton
                  title={t("materialDeliveries.review")}
                  onPress={() => review(item)}
                />
                <SecondaryButton
                  title={t("materialDeliveries.edit")}
                  onPress={() =>
                    navigation.navigate("MaterialDeliveryEditor", {
                      deliveryId: item.id,
                      requestId: item.requestId,
                    })
                  }
                />
              </>
            ) : null}
            {item.status === "discrepancy" ? (
              <WarningActionButton
                title={t("materialDeliveries.resolve")}
                onPress={() => setResolving(item)}
              />
            ) : null}
            {item.resolution ? (
              <Text style={s.resolution}>{item.resolution}</Text>
            ) : null}
          </Card>
        );
      })}
      {!deliveries.length ? (
        <EmptyState
          title={t("materialDeliveries.empty")}
          hint={t("materialDeliveries.emptyHint")}
        />
      ) : null}
    </ScreenShell>
  );
}
const s = StyleSheet.create({
  hero: {
    backgroundColor: "#172337",
    borderColor: "#172337",
    borderTopWidth: 5,
    borderTopColor: "#E8B84A",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  heroTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  heroText: { color: "#C9D1DC", fontSize: 12, lineHeight: 18 },
  delivery: { borderLeftWidth: 7 },
  status: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
    color: colors.textMuted,
  },
  supplier: { color: colors.text, fontSize: 18, fontWeight: "900" },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  total: { color: colors.text, fontSize: 12, fontWeight: "800" },
  tableHead: {
    flexDirection: "row",
    paddingBottom: spacing.xs,
    borderBottomWidth: 2,
    borderBottomColor: "#172337",
  },
  tableRow: {
    flexDirection: "row",
    minHeight: 34,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { flex: 1, color: colors.text, fontSize: 10, fontWeight: "700" },
  num: {
    width: 52,
    textAlign: "right",
    color: colors.text,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  bad: { color: colors.danger, fontWeight: "900" },
  resolve: { borderTopWidth: 5, borderTopColor: colors.danger },
  resolution: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: colors.primarySoft,
    padding: spacing.sm,
  },
  photo: {
    width: "100%",
    height: 190,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
});
