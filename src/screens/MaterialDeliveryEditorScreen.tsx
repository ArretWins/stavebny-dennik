import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, Check, Images } from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
} from "@/components/ui";
import { createId, nowIso } from "@/domain/ids";
import type { Attachment } from "@/domain/types";
import {
  validateMaterialDelivery,
  type DeliveryInputLine,
} from "@/domain/materialDeliveries";
import { t } from "@/i18n";
import {
  pickPhoto,
  signedAttachmentUrl,
  type PhotoSource,
} from "@/services/attachments";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";
type InputLine = DeliveryInputLine & {
  deliveredText: string;
  damagedText: string;
};
export function MaterialDeliveryEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { requestId?: string; deliveryId?: string } };
}) {
  const { selectedProject, state, saveMaterialDelivery, addAttachment } =
    useApp();
  const existing = state.materialDeliveries.find(
    (x) => x.id === route.params?.deliveryId,
  );
  const eligible = state.materialRequests.filter(
    (x) =>
      x.projectId === selectedProject?.id &&
      ["approved", "partially_purchased", "purchased"].includes(x.status),
  );
  const [requestId, setRequestId] = useState(
    existing?.requestId ?? route.params?.requestId ?? eligible[0]?.id ?? "",
  );
  const requestItems = state.materialRequestItems.filter(
    (x) => x.requestId === requestId,
  );
  const existingLines = state.materialDeliveryLines.filter(
    (x) => x.deliveryId === existing?.id,
  );
  const makeLines = (): InputLine[] =>
    requestItems.map((item) => {
      const old = existingLines.find((x) => x.requestItemId === item.id);
      return {
        requestItemId: item.id,
        itemName: item.name,
        unit: item.unit,
        expectedQuantity: item.quantity,
        deliveredQuantity: old?.deliveredQuantity ?? item.quantity,
        damagedQuantity: old?.damagedQuantity ?? 0,
        deliveredText: String(old?.deliveredQuantity ?? item.quantity),
        damagedText: String(old?.damagedQuantity ?? 0),
      };
    });
  const [lines, setLines] = useState<InputLine[]>(makeLines);
  const selectedQuote = (state.materialSupplierQuotes ?? []).find(
    (x) => x.requestId === requestId && x.status === "selected",
  );
  const [supplier, setSupplier] = useState(
    existing?.supplierName ?? selectedQuote?.supplierName ?? "",
  );
  const [noteNumber, setNoteNumber] = useState(
    existing?.deliveryNoteNumber ?? "",
  );
  const [deliveredAt, setDeliveredAt] = useState(
    existing?.deliveredAt ?? nowIso(),
  );
  const [receiver, setReceiver] = useState(
    existing?.receiverName ?? "Stavbyvedúci",
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [photo, setPhoto] = useState<Attachment>();
  const [id] = useState(existing?.id ?? createId("delivery"));
  const [busy, setBusy] = useState(false);
  const savedPhoto = state.attachments.find(
    (x) => x.id === (photo?.id ?? existing?.attachmentId),
  );
  const [previewUri, setPreviewUri] = useState(savedPhoto?.localUri);
  useEffect(() => {
    let active = true;
    if (!savedPhoto) {
      setPreviewUri(undefined);
      return () => {
        active = false;
      };
    }
    if (photo || !savedPhoto.storagePath) {
      setPreviewUri(savedPhoto.localUri);
      return () => {
        active = false;
      };
    }
    void signedAttachmentUrl(savedPhoto.storagePath)
      .then((uri) => {
        if (active) setPreviewUri(uri);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [photo, savedPhoto?.id, savedPhoto?.localUri, savedPhoto?.storagePath]);
  const selectRequest = (value: string) => {
    setRequestId(value);
    const items = state.materialRequestItems.filter(
      (x) => x.requestId === value,
    );
    setLines(
      items.map((x) => ({
        requestItemId: x.id,
        itemName: x.name,
        unit: x.unit,
        expectedQuantity: x.quantity,
        deliveredQuantity: x.quantity,
        damagedQuantity: 0,
        deliveredText: String(x.quantity),
        damagedText: "0",
      })),
    );
    const quote = (state.materialSupplierQuotes ?? []).find(
      (x) => x.requestId === value && x.status === "selected",
    );
    setSupplier(quote?.supplierName ?? "");
  };
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
  const setQuantity = (
    index: number,
    key: "deliveredText" | "damagedText",
    value: string,
  ) =>
    setLines((current) =>
      current.map((x, i) =>
        i === index
          ? {
              ...x,
              [key]: value,
              [key === "deliveredText"
                ? "deliveredQuantity"
                : "damagedQuantity"]: Number(value.replace(",", ".")),
            }
          : x,
      ),
    );
  const choose = async (source: PhotoSource) => {
    try {
      const item = await pickPhoto(
        state.activeUserId ?? "",
        selectedProject.id,
        "material_delivery",
        source,
        id,
      );
      if (item) setPhoto(item);
    } catch {
      Alert.alert(t("errors.fileUnsupported"));
    }
  };
  const save = async () => {
    const normalized = lines.map(
      ({ deliveredText: _, damagedText: __, ...x }) => x,
    );
    const input = {
      id,
      projectId: selectedProject.id,
      requestId,
      supplierName: supplier,
      deliveryNoteNumber: noteNumber || undefined,
      deliveredAt,
      receiverName: receiver,
      note: note || undefined,
      attachmentId: photo?.id ?? existing?.attachmentId,
      lines: normalized,
    };
    if (validateMaterialDelivery(input, normalized) !== "ok") {
      Alert.alert(t("materialDeliveries.validation"));
      return;
    }
    setBusy(true);
    try {
      if (photo && !state.attachments.some((x) => x.id === photo.id))
        await addAttachment(photo);
      await saveMaterialDelivery(input);
      navigation.goBack();
    } catch {
      Alert.alert(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScreenShell>
      <TopBar
        title={
          existing ? t("materialDeliveries.edit") : t("materialDeliveries.new")
        }
        onBack={() => navigation.goBack()}
      />
      <Card style={s.sheet}>
        <Text style={s.eyebrow}>{t("materialDeliveries.ledger")}</Text>
        <Text style={s.intro}>{t("materialDeliveries.intro")}</Text>
        <Text style={s.label}>{t("materialDeliveries.request")}</Text>
        <View style={s.wrap}>
          {eligible.map((req) => (
            <Pressable
              key={req.id}
              disabled={!!existing}
              onPress={() => selectRequest(req.id)}
              style={[s.request, req.id === requestId && s.requestActive]}
            >
              <Text
                style={[
                  s.requestText,
                  req.id === requestId && s.requestTextActive,
                ]}
              >
                {state.materialRequestItems
                  .filter((x) => x.requestId === req.id)
                  .map((x) => x.name)
                  .slice(0, 2)
                  .join(", ") || req.id}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextField
          label={t("materialDeliveries.supplier")}
          value={supplier}
          onChangeText={setSupplier}
          maxLength={160}
        />
        <TextField
          label={t("materialDeliveries.deliveryNote")}
          value={noteNumber}
          onChangeText={setNoteNumber}
          maxLength={100}
        />
        <TextField
          label={t("materialDeliveries.deliveredAt")}
          value={deliveredAt}
          onChangeText={setDeliveredAt}
        />
        <TextField
          label={t("materialDeliveries.receiver")}
          value={receiver}
          onChangeText={setReceiver}
          maxLength={180}
        />
        <Text style={s.label}>{t("materialDeliveries.items")}</Text>
        {lines.map((line, index) => (
          <View key={line.requestItemId} style={s.line}>
            <View style={s.lineHead}>
              <Text style={s.item}>{line.itemName}</Text>
              <Text style={s.expected}>
                {t("materialDeliveries.ordered")}: {line.expectedQuantity}{" "}
                {line.unit}
              </Text>
            </View>
            <View style={s.quantityRow}>
              <View style={s.flex}>
                <TextField
                  label={t("materialDeliveries.delivered")}
                  value={line.deliveredText}
                  onChangeText={(v) => setQuantity(index, "deliveredText", v)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={s.flex}>
                <TextField
                  label={t("materialDeliveries.damaged")}
                  value={line.damagedText}
                  onChangeText={(v) => setQuantity(index, "damagedText", v)}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>
        ))}
        <TextArea
          label={t("materialDeliveries.note")}
          value={note}
          onChangeText={setNote}
          placeholder={t("app.optional")}
          maxLength={1000}
        />
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={s.photo} />
        ) : null}
        <View style={s.quantityRow}>
          <SecondaryButton
            title={t("attachments.gallery")}
            icon={Images}
            onPress={() => void choose("library")}
            style={s.flex}
          />
          <SecondaryButton
            title={t("attachments.camera")}
            icon={Camera}
            onPress={() => void choose("camera")}
            style={s.flex}
          />
        </View>
        {photo ? (
          <Text style={s.ready}>{t("materialDeliveries.photoReady")}</Text>
        ) : null}
        <PrimaryButton
          title={t("materialDeliveries.save")}
          icon={Check}
          disabled={busy || !requestId || !lines.length}
          onPress={() => void save()}
        />
      </Card>
    </ScreenShell>
  );
}
const s = StyleSheet.create({
  sheet: {
    borderTopWidth: 6,
    borderTopColor: "#C8A96B",
    backgroundColor: "#FBF8F0",
  },
  eyebrow: {
    color: "#755B25",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  intro: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  label: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  request: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    maxWidth: "100%",
  },
  requestActive: { backgroundColor: "#172337", borderColor: "#172337" },
  requestText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  requestTextActive: { color: colors.surface },
  line: {
    borderTopWidth: 1,
    borderTopColor: "#D9CEB7",
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  lineHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  item: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "900" },
  expected: { color: "#755B25", fontSize: 11, fontWeight: "800" },
  quantityRow: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  photo: { height: 200, width: "100%", borderRadius: radius.md },
  ready: { color: colors.primaryDark, fontSize: 12, fontWeight: "700" },
});
