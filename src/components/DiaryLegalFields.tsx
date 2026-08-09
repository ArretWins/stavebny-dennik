import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Clock3, Plus, Scale, X } from "lucide-react-native";
import { Card, SecondaryButton, TextArea, TextField } from "./ui";
import { createId } from "../domain/ids";
import {
  DIARY_TECHNICAL_CATEGORIES,
  type DiaryLegalDetails,
} from "../domain/legalDiary";
import type { DiaryTechnicalCategory } from "../domain/types";
import { t } from "../i18n";
import { colors, radius, spacing } from "../theme/tokens";

export function DiaryLegalFields({
  value,
  workerCount,
  onChange,
}: {
  value: DiaryLegalDetails;
  workerCount: number;
  onChange: (value: DiaryLegalDetails) => void;
}) {
  const [role, setRole] = useState("");
  const [roleCount, setRoleCount] = useState("1");
  const [category, setCategory] =
    useState<DiaryTechnicalCategory>("material_delivery");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const roleTotal = useMemo(
    () => value.workforceRoles.reduce((sum, item) => sum + item.count, 0),
    [value.workforceRoles],
  );
  const addRole = () => {
    const count = Number(roleCount);
    if (
      role.trim().length < 2 ||
      !Number.isInteger(count) ||
      count < 1 ||
      value.workforceRoles.some(
        (item) =>
          item.role.trim().toLocaleLowerCase("sk-SK") ===
          role.trim().toLocaleLowerCase("sk-SK"),
      )
    )
      return;
    onChange({
      ...value,
      workforceRoles: [...value.workforceRoles, { role: role.trim(), count }],
    });
    setRole("");
    setRoleCount("1");
  };
  const addTechnicalRecord = () => {
    if (description.trim().length < 3) return;
    onChange({
      ...value,
      technicalRecords: [
        ...value.technicalRecords,
        {
          id: createId("diary-technical"),
          category,
          description: description.trim(),
          reference: reference.trim() || undefined,
        },
      ],
    });
    setDescription("");
    setReference("");
  };
  return (
    <Card style={styles.legalCard}>
      <View style={styles.heading}>
        <View style={styles.seal}>
          <Scale color={colors.primaryDark} size={24} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{t("diaryLegal.title")}</Text>
          <Text style={styles.hint}>{t("diaryLegal.hint")}</Text>
        </View>
      </View>

      <View style={styles.timeRow}>
        <View style={styles.flex}>
          <TextField
            label={t("diaryLegal.workStart")}
            maxLength={5}
            placeholder="07:00"
            value={value.workStartTime ?? ""}
            onChangeText={(workStartTime) =>
              onChange({ ...value, workStartTime })
            }
          />
        </View>
        <Clock3 color={colors.textMuted} size={19} />
        <View style={styles.flex}>
          <TextField
            label={t("diaryLegal.workEnd")}
            maxLength={5}
            placeholder="16:00"
            value={value.workEndTime ?? ""}
            onChangeText={(workEndTime) => onChange({ ...value, workEndTime })}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t("diaryLegal.workforceTitle")}</Text>
      <Text style={styles.sectionHint}>{t("diaryLegal.workforceHint")}</Text>
      {value.workforceRoles.map((item) => (
        <View style={styles.ledgerRow} key={item.role}>
          <Text style={styles.ledgerText}>{item.role}</Text>
          <Text style={styles.ledgerCount}>{item.count}</Text>
          <Pressable
            accessibilityLabel={t("diaryLegal.removeRole")}
            onPress={() =>
              onChange({
                ...value,
                workforceRoles: value.workforceRoles.filter(
                  (roleItem) => roleItem !== item,
                ),
              })
            }
            style={styles.remove}
          >
            <X color={colors.danger} size={18} />
          </Pressable>
        </View>
      ))}
      <View style={styles.entryRow}>
        <View style={styles.flexWide}>
          <TextField
            label={t("diaryLegal.role")}
            maxLength={80}
            placeholder={t("diaryLegal.rolePlaceholder")}
            value={role}
            onChangeText={setRole}
          />
        </View>
        <View style={styles.countField}>
          <TextField
            label={t("diaryLegal.roleCount")}
            keyboardType="number-pad"
            maxLength={3}
            value={roleCount}
            onChangeText={setRoleCount}
          />
        </View>
      </View>
      <SecondaryButton
        icon={Plus}
        title={t("diaryLegal.addRole")}
        onPress={addRole}
      />
      {value.workforceRoles.length && roleTotal !== workerCount ? (
        <Text style={styles.warning}>
          {t("diaryLegal.workforceMismatch", {
            roles: roleTotal,
            total: workerCount,
          })}
        </Text>
      ) : null}

      <View style={styles.rule} />
      <Text style={styles.sectionTitle}>{t("diaryLegal.recordsTitle")}</Text>
      <Text style={styles.sectionHint}>{t("diaryLegal.recordsHint")}</Text>
      {value.technicalRecords.map((item) => (
        <View style={styles.record} key={item.id}>
          <View style={styles.flex}>
            <Text style={styles.recordCategory}>
              {t(`diaryLegal.category.${item.category}`)}
            </Text>
            <Text style={styles.recordText}>{item.description}</Text>
            {item.reference ? (
              <Text style={styles.reference}>{item.reference}</Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t("diaryLegal.removeRecord")}
            onPress={() =>
              onChange({
                ...value,
                technicalRecords: value.technicalRecords.filter(
                  (record) => record.id !== item.id,
                ),
              })
            }
            style={styles.remove}
          >
            <X color={colors.danger} size={18} />
          </Pressable>
        </View>
      ))}
      <View style={styles.chips}>
        {DIARY_TECHNICAL_CATEGORIES.map((item) => (
          <Pressable
            key={item}
            onPress={() => setCategory(item)}
            style={[styles.chip, category === item && styles.chipSelected]}
          >
            <Text
              style={[
                styles.chipText,
                category === item && styles.chipTextSelected,
              ]}
            >
              {t(`diaryLegal.category.${item}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextArea
        label={t("diaryLegal.recordDescription")}
        maxLength={500}
        onChangeText={setDescription}
        placeholder={t("diaryLegal.recordPlaceholder")}
        value={description}
      />
      <TextField
        label={t("diaryLegal.recordReference")}
        maxLength={120}
        onChangeText={setReference}
        placeholder={t("diaryLegal.referencePlaceholder")}
        value={reference}
      />
      <SecondaryButton
        icon={Plus}
        title={t("diaryLegal.addRecord")}
        onPress={addTechnicalRecord}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  legalCard: { borderTopWidth: 5, borderTopColor: "#173F35", gap: spacing.md },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  seal: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "#9CB5A8",
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  flexWide: { flex: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: "900" },
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  sectionHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  ledgerRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  ledgerText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" },
  ledgerCount: { color: colors.primaryDark, fontSize: 15, fontWeight: "900" },
  remove: { padding: spacing.sm },
  entryRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  countField: { width: 92 },
  warning: {
    color: colors.danger,
    backgroundColor: "#FCE8E8",
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 11,
    fontWeight: "700",
  },
  rule: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  record: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  recordCategory: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: "900",
  },
  recordText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  reference: { color: colors.textMuted, fontSize: 10, marginTop: 3 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primaryDark, backgroundColor: "#173F35" },
  chipText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },
  chipTextSelected: { color: "#FFFFFF" },
});
