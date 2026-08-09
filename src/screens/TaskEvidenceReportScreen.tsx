import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  CheckCircle2,
  ShieldCheck,
  History,
  Images,
  Share2,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PdfPreviewCard,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from '@/components/ui';
import { t } from '@/i18n';
import { formatDate, formatDateTime } from '@/i18n/format';
import {
  createTaskEvidencePdf,
  reportFromPdf,
  shareReport,
  uploadPrivateReport,
} from '@/services/pdf';
import { supabase } from '@/services/supabase';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

export function TaskEvidenceReportScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params: { taskId: string } };
}) {
  const { selectedProject, state, addReport } = useApp();
  const [busy, setBusy] = useState(false);
  const task = state.siteTasks.find(item => item.id === route.params.taskId);
  const events = useMemo(
    () => state.siteTaskEvents.filter(item => item.taskId === task?.id),
    [state.siteTaskEvents, task?.id],
  );
  const attachments = useMemo(
    () =>
      state.attachments.filter(
        item =>
          item.relatedEntityType === 'site_task' &&
          item.relatedEntityId === task?.id,
      ),
    [state.attachments, task?.id],
  );
  const checklist = state.projectChecklists.find(
    item => item.id === task?.sourceChecklistId,
  );
  const workers = state.workers.filter(
    item => item.projectId === selectedProject?.id,
  );
  const reports = state.reports
    .filter(
      item =>
        item.projectId === selectedProject?.id &&
        item.type === 'evidence_pack' &&
        item.sourceEntityId === task?.id,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const beforeCount = attachments.filter(
    item => item.evidenceRole === 'before',
  ).length;
  const afterCount = attachments.filter(
    item => item.evidenceRole === 'after',
  ).length;

  const generate = async () => {
    if (!selectedProject || !task) return;
    setBusy(true);
    try {
      const pdf = await createTaskEvidencePdf({
        project: selectedProject,
        task,
        events,
        attachments,
        workers,
        checklist,
      });
      const local = reportFromPdf(
        selectedProject.ownerId,
        selectedProject.id,
        'evidence_pack',
        pdf.uri,
        pdf.pageCount,
        task.id,
        pdf.attachmentIds,
      );
      let report = local;
      if (supabase) {
        try {
          report = await uploadPrivateReport(local, pdf.uri);
        } catch {
          report = local;
        }
      }
      await addReport(report);
      Alert.alert(
        t('evidencePack.ready'),
        t('evidencePack.readyHint', {
          pages: pdf.pageCount,
          digest: pdf.manifestDigest.slice(0, 12),
        }),
        [
          { text: t('app.close') },
          {
            text: t('reports.share'),
            onPress: () => void shareReport(report),
          },
        ],
      );
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (!selectedProject || !task)
    return (
      <ScreenShell>
        <TopBar
          title={t('evidencePack.title')}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t('siteTasks.empty')} />
      </ScreenShell>
    );

  return (
    <ScreenShell>
      <TopBar
        title={t('evidencePack.title')}
        onBack={() => navigation.goBack()}
      />
      <Card style={styles.hero}>
        <View style={styles.row}>
          <View style={styles.heroIcon}>
            <ShieldCheck color={colors.primary} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>{task.title}</Text>
            <Text style={styles.meta}>{t('evidencePack.description')}</Text>
          </View>
        </View>
      </Card>
      <View style={styles.grid}>
        <Card style={styles.metric}>
          <Images color={colors.primary} size={24} />
          <Text style={styles.metricValue}>
            {beforeCount}/{afterCount}
          </Text>
          <Text style={styles.meta}>{t('evidencePack.photosMetric')}</Text>
        </Card>
        <Card style={styles.metric}>
          <History color={colors.primary} size={24} />
          <Text style={styles.metricValue}>{events.length}</Text>
          <Text style={styles.meta}>{t('evidencePack.eventsMetric')}</Text>
        </Card>
        <Card style={styles.metric}>
          <CheckCircle2
            color={checklist ? colors.primary : colors.textMuted}
            size={24}
          />
          <Text style={styles.metricValue}>{checklist ? '1' : '0'}</Text>
          <Text style={styles.meta}>{t('evidencePack.checklistMetric')}</Text>
        </Card>
      </View>
      <Card>
        <Text style={styles.sectionTitle}>{t('evidencePack.includes')}</Text>
        <Text style={styles.meta}>{t('evidencePack.includesHint')}</Text>
        <Text style={styles.security}>{t('evidencePack.digestHint')}</Text>
      </Card>
      <PrimaryButton
        title={t('evidencePack.create')}
        icon={ShieldCheck}
        disabled={busy}
        onPress={() => void generate()}
      />
      {reports.length ? (
        <>
          <Text style={styles.sectionTitle}>{t('evidencePack.history')}</Text>
          {reports.map(report => (
            <Card key={report.id}>
              <PdfPreviewCard
                title={t('evidencePack.title')}
                project={selectedProject.name}
                date={formatDate(report.createdAt)}
                pageCount={report.pageCount}
              />
              <Text style={styles.meta}>
                {t('reports.generatedAt', {
                  time: formatDateTime(report.createdAt),
                })}
              </Text>
              <SecondaryButton
                title={t('reports.share')}
                icon={Share2}
                onPress={() => void shareReport(report)}
              />
            </Card>
          ))}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: { borderTopWidth: 4, borderTopColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', gap: spacing.sm },
  metric: { flex: 1, alignItems: 'center', padding: spacing.md },
  metricValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  security: {
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 12,
    lineHeight: 18,
  },
});
