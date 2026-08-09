import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Check,
  FileSpreadsheet,
  QrCode,
  Share2,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from '@/components/ui';
import { projectToolReference } from '@/domain/tools';
import { createToolRegisterPdf, shareReport } from '@/services/pdf';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

type Mode = 'inventory' | 'labels';

export function ToolReportsScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, addReport } = useApp();
  const [mode, setMode] = useState<Mode>('inventory');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const tools = useMemo(
    () =>
      state.projectTools
        .filter(tool => tool.projectId === selectedProject?.id)
        .sort((left, right) => left.assetNumber - right.assetNumber),
    [selectedProject?.id, state.projectTools],
  );
  useEffect(() => {
    if (selectionReady || !tools.length) return;
    setSelectedIds(
      tools.filter(tool => tool.status !== 'retired').map(tool => tool.id),
    );
    setSelectionReady(true);
  }, [selectionReady, tools]);
  const selected = tools.filter(tool => selectedIds.includes(tool.id));
  const reports = state.reports.filter(
    report =>
      report.projectId === selectedProject?.id &&
      report.type === 'tool_inventory',
  );
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar
          title={t('toolReports.title')}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t('projects.noProjects')} />
      </ScreenShell>
    );

  const toggle = (id: string) =>
    setSelectedIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id],
    );
  const create = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const report = await createToolRegisterPdf({
        ownerId: selectedProject.ownerId,
        project: selectedProject,
        tools: selected,
        workers: state.workers.filter(
          worker => worker.projectId === selectedProject.id,
        ),
        events: state.projectToolEvents.filter(
          event => event.projectId === selectedProject.id,
        ),
        mode,
      });
      await addReport(report);
      await shareReport(report);
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScreenShell>
      <TopBar title={t('toolReports.title')} onBack={() => navigation.goBack()} />
      <View style={styles.modeGrid}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('inventory')}
          style={[styles.mode, mode === 'inventory' && styles.modeActive]}
        >
          <FileSpreadsheet
            color={mode === 'inventory' ? '#FFFFFF' : '#1F2A30'}
            size={28}
          />
          <Text style={[styles.modeTitle, mode === 'inventory' && styles.modeTitleActive]}>
            {t('toolReports.inventoryTitle')}
          </Text>
          <Text style={[styles.modeHint, mode === 'inventory' && styles.modeHintActive]}>
            {t('toolReports.inventoryHint')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMode('labels')}
          style={[styles.mode, mode === 'labels' && styles.modeActive]}
        >
          <QrCode color={mode === 'labels' ? '#FFFFFF' : '#1F2A30'} size={28} />
          <Text style={[styles.modeTitle, mode === 'labels' && styles.modeTitleActive]}>
            {t('toolReports.labelsTitle')}
          </Text>
          <Text style={[styles.modeHint, mode === 'labels' && styles.modeHintActive]}>
            {t('toolReports.labelsHint')}
          </Text>
        </Pressable>
      </View>
      <Card style={styles.selectionSummary}>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryValue}>{selected.length}</Text>
            <Text style={styles.summaryLabel}>{t('toolReports.selected')}</Text>
          </View>
          <SecondaryButton
            title={
              selected.length === tools.length
                ? t('toolReports.clearSelection')
                : t('toolReports.selectAll')
            }
            onPress={() =>
              setSelectedIds(
                selected.length === tools.length ? [] : tools.map(tool => tool.id),
              )
            }
          />
        </View>
      </Card>
      <Text style={styles.sectionTitle}>{t('toolReports.chooseTools')}</Text>
      {tools.map(tool => {
        const included = selectedIds.includes(tool.id);
        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: included }}
            key={tool.id}
            onPress={() => toggle(tool.id)}
            style={[styles.toolRow, included && styles.toolRowIncluded]}
          >
            <View style={[styles.checkbox, included && styles.checkboxActive]}>
              {included ? <Check color="#FFFFFF" size={16} /> : null}
            </View>
            <Text style={styles.assetCode}>{projectToolReference(tool.assetNumber)}</Text>
            <View style={styles.flex}>
              <Text style={styles.toolName}>{tool.name}</Text>
              <Text style={styles.meta}>
                {tool.category} · {t(`tools.status.${tool.status}`)}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {!tools.length ? (
        <EmptyState title={t('tools.empty')} hint={t('tools.emptyHint')} />
      ) : null}
      <PrimaryButton
        title={busy ? t('app.loading') : t(`toolReports.create.${mode}`)}
        icon={mode === 'labels' ? QrCode : FileSpreadsheet}
        disabled={busy || !selected.length}
        onPress={() => void create()}
      />
      <Text style={styles.printHint}>{t('toolReports.printHint')}</Text>
      <Text style={styles.sectionTitle}>{t('toolReports.history')}</Text>
      {reports.map(report => (
        <Card key={report.id}>
          <View style={styles.summaryRow}>
            <View style={styles.flex}>
              <Text style={styles.toolName}>
                {report.sourceEntityId === 'tool_labels'
                  ? t('toolReports.labelsTitle')
                  : t('toolReports.inventoryTitle')}
              </Text>
              <Text style={styles.meta}>
                {formatDateTime(report.createdAt)} · {t('reports.pageCount', {
                  count: report.pageCount,
                  total: report.pageCount,
                })}
              </Text>
            </View>
          </View>
          <SecondaryButton
            title={t('reports.share')}
            icon={Share2}
            onPress={() => void shareReport(report)}
          />
        </Card>
      ))}
      {!reports.length ? <EmptyState title={t('toolReports.noHistory')} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modeGrid: { flexDirection: 'row', gap: spacing.sm },
  mode: { flex: 1, minHeight: 150, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
  modeActive: { backgroundColor: '#1F2A30', borderColor: '#1F2A30' },
  modeTitle: { color: '#1F2A30', fontSize: 15, fontWeight: '900' },
  modeTitleActive: { color: '#FFFFFF' },
  modeHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  modeHintActive: { color: '#BCC6CB' },
  selectionSummary: { borderLeftWidth: 5, borderLeftColor: '#E46F2E' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryValue: { color: '#1F2A30', fontSize: 29, fontWeight: '900', fontFamily: 'monospace' },
  summaryLabel: { color: colors.textMuted, fontSize: 11, textTransform: 'uppercase' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  toolRow: { minHeight: 62, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  toolRowIncluded: { borderColor: '#90A9B5', backgroundColor: '#F3F7F8' },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#2B6F95', borderColor: '#2B6F95' },
  assetCode: { color: '#1F2A30', fontSize: 11, fontWeight: '900', fontFamily: 'monospace' },
  toolName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  printHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
