import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  ChevronRight,
  CircleAlert,
  Hammer,
  PackageCheck,
  Plus,
  Printer,
  UserRound,
  Wrench,
} from "lucide-react-native";
import {
  Card,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  ScreenShell,
  TopBar,
} from "@/components/ui";
import type { ProjectTool, ProjectToolStatus } from "@/domain/types";
import { isProjectToolOverdue, projectToolReference } from "@/domain/tools";
import { localDateIso } from "@/domain/ids";
import { t } from "@/i18n";
import { formatDate } from "@/i18n/format";
import { useApp } from "@/state/app";
import { colors, radius, spacing } from "@/theme/tokens";

type Filter = "active" | "issued" | "attention" | "retired";

const statusColor: Record<ProjectToolStatus, string> = {
  available: colors.primary,
  issued: "#2B6F95",
  maintenance: colors.warning,
  lost: colors.danger,
  retired: colors.textMuted,
};

function ToolCard({
  tool,
  workerName,
  overdue,
  onPress,
}: {
  tool: ProjectTool;
  workerName?: string;
  overdue: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${projectToolReference(tool.assetNumber)} ${tool.name}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Card
        style={{
          ...styles.toolCard,
          borderLeftColor: overdue ? colors.danger : statusColor[tool.status],
        }}
      >
        <View style={styles.toolHeader}>
          <View style={styles.assetStamp}>
            <Text style={styles.assetStampText}>
              {projectToolReference(tool.assetNumber)}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.toolName}>{tool.name}</Text>
            <Text style={styles.meta}>{tool.category}</Text>
          </View>
          <ChevronRight color={colors.textMuted} size={22} />
        </View>
        <View style={styles.toolFooter}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: overdue
                  ? colors.danger
                  : statusColor[tool.status],
              },
            ]}
          />
          <Text style={[styles.statusText, overdue && styles.overdueText]}>
            {overdue ? t("tools.overdue") : t(`tools.status.${tool.status}`)}
          </Text>
          {workerName ? (
            <View style={styles.workerLine}>
              <UserRound color={colors.textMuted} size={15} />
              <Text style={styles.workerText}>{workerName}</Text>
            </View>
          ) : null}
          {tool.expectedReturnDate ? (
            <Text style={styles.returnDate}>
              {formatDate(tool.expectedReturnDate)}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export function ToolsScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, refreshProjectData } = useApp();
  const [filter, setFilter] = useState<Filter>("active");
  const today = localDateIso();
  useEffect(() => {
    void refreshProjectData();
  }, [refreshProjectData, selectedProject?.id]);
  const projectTools = useMemo(
    () =>
      state.projectTools.filter(
        (tool) => tool.projectId === selectedProject?.id,
      ),
    [selectedProject?.id, state.projectTools],
  );
  const overdueCount = projectTools.filter((tool) =>
    isProjectToolOverdue(tool, today),
  ).length;
  const attentionCount = projectTools.filter(
    (tool) =>
      ["maintenance", "lost"].includes(tool.status) ||
      isProjectToolOverdue(tool, today),
  ).length;
  const visible = projectTools
    .filter((tool) => {
      if (filter === "issued") return tool.status === "issued";
      if (filter === "attention")
        return (
          ["maintenance", "lost"].includes(tool.status) ||
          isProjectToolOverdue(tool, today)
        );
      if (filter === "retired") return tool.status === "retired";
      return tool.status !== "retired";
    })
    .sort(
      (left, right) =>
        Number(isProjectToolOverdue(right, today)) -
          Number(isProjectToolOverdue(left, today)) ||
        left.assetNumber - right.assetNumber,
    );
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar title={t("tools.title")} onBack={() => navigation.goBack()} />
        <EmptyState title={t("projects.noProjects")} />
      </ScreenShell>
    );

  return (
    <ScreenShell>
      <TopBar title={t("tools.title")} onBack={() => navigation.goBack()} />
      <View style={styles.ledgerHero}>
        <View style={styles.heroRail}>
          {Array.from({ length: 12 }).map((_, index) => (
            <View key={index} style={styles.railTick} />
          ))}
        </View>
        <View style={styles.heroBody}>
          <View style={styles.heroIcon}>
            <Hammer color="#F6B26B" size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroKicker}>{selectedProject.name}</Text>
            <Text style={styles.heroTitle}>{t("tools.ledgerTitle")}</Text>
            <Text style={styles.heroHint}>{t("tools.ledgerHint")}</Text>
          </View>
        </View>
        <View style={styles.heroCounters}>
          <View style={styles.heroCounter}>
            <PackageCheck color="#A9CDB5" size={20} />
            <Text style={styles.counterValue}>
              {
                projectTools.filter((item) => item.status === "available")
                  .length
              }
            </Text>
            <Text style={styles.counterLabel}>
              {t("tools.metricAvailable")}
            </Text>
          </View>
          <View style={styles.heroCounter}>
            <UserRound color="#AFCFE0" size={20} />
            <Text style={styles.counterValue}>
              {projectTools.filter((item) => item.status === "issued").length}
            </Text>
            <Text style={styles.counterLabel}>{t("tools.metricIssued")}</Text>
          </View>
          <View style={styles.heroCounter}>
            <CircleAlert color="#F6B26B" size={20} />
            <Text style={styles.counterValue}>{attentionCount}</Text>
            <Text style={styles.counterLabel}>
              {t("tools.metricAttention")}
            </Text>
          </View>
        </View>
      </View>
      <PrimaryButton
        title={t("tools.add")}
        icon={Plus}
        onPress={() => navigation.navigate("ToolEditor", {})}
      />
      <SecondaryButton
        title={t("toolReports.open")}
        icon={Printer}
        onPress={() => navigation.navigate("ToolReports")}
      />
      <SecondaryButton
        title={t("taskTools.open")}
        icon={Hammer}
        onPress={() => navigation.navigate("TaskTools")}
      />
      <View style={styles.filters}>
        {(["active", "issued", "attention", "retired"] as Filter[]).map(
          (item) => (
            <Pressable
              accessibilityRole="button"
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filter, filter === item && styles.filterActive]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item && styles.filterTextActive,
                ]}
              >
                {t(`tools.filter.${item}`)}
                {item === "attention" && attentionCount
                  ? ` · ${attentionCount}`
                  : ""}
                {item === "issued" && overdueCount ? ` · ${overdueCount}` : ""}
              </Text>
            </Pressable>
          ),
        )}
      </View>
      {visible.map((tool) => {
        const worker = state.workers.find(
          (item) => item.id === tool.currentWorkerId,
        );
        return (
          <ToolCard
            key={tool.id}
            tool={tool}
            workerName={
              worker ? `${worker.firstName} ${worker.lastName}` : undefined
            }
            overdue={isProjectToolOverdue(tool, today)}
            onPress={() =>
              navigation.navigate("ToolEditor", { toolId: tool.id })
            }
          />
        );
      })}
      {!visible.length ? (
        <EmptyState
          title={t("tools.empty")}
          hint={
            filter === "active" ? t("tools.emptyHint") : t("tools.filterEmpty")
          }
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.78 },
  ledgerHero: {
    backgroundColor: "#1F2A30",
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  heroRail: {
    height: 13,
    backgroundColor: "#11191D",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
  },
  railTick: { width: 1, height: 6, backgroundColor: "#6D7B83" },
  heroBody: { flexDirection: "row", gap: spacing.md, padding: spacing.xl },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#536169",
    alignItems: "center",
    justifyContent: "center",
  },
  heroKicker: {
    color: "#91A0A8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
    marginTop: 2,
  },
  heroHint: { color: "#B9C2C7", fontSize: 12, lineHeight: 17, marginTop: 4 },
  heroCounters: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#445158",
  },
  heroCounter: {
    flex: 1,
    minHeight: 75,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "#445158",
  },
  counterValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  counterLabel: {
    color: "#9DAAB1",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  filter: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterActive: { backgroundColor: "#26343B", borderColor: "#26343B" },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: "#FFFFFF" },
  toolCard: { borderLeftWidth: 6, paddingLeft: spacing.md },
  toolHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  assetStamp: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#EDF1F2",
    borderRadius: 6,
  },
  assetStampText: {
    color: "#26343B",
    fontSize: 11,
    fontWeight: "900",
    fontFamily: "monospace",
  },
  toolName: { color: colors.text, fontSize: 16, fontWeight: "900" },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  toolFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.text, fontSize: 11, fontWeight: "800" },
  overdueText: { color: colors.danger },
  workerLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  workerText: { color: colors.textMuted, fontSize: 11 },
  returnDate: { color: colors.textMuted, fontSize: 11 },
});
