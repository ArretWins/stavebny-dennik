import React, { useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import {
  Eye,
  FileCheck2,
  FileText,
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
import type { DelayEvent, ReportExport } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, formatDateTime } from '@/i18n/format';
import {
  createPdf,
  delayPdfHtml,
  diaryPdfHtml,
  generateRemoteReport,
  inlinePdfAttachments,
  reportFromPdf,
  shareReport,
} from '@/services/pdf';
import { supabase } from '@/services/supabase';
import { useApp } from '@/state/app';
import { colors } from '@/theme/tokens';

function reportTitle(type: ReportExport['type']): string {
  if (type === 'diary') return t('reports.diaryReport');
  if (type === 'delay') return t('reports.delayReport');
  if (type === 'weekly') return t('weeklyReport.title');
  if (type === 'tool_inventory') return t('toolReports.inventoryTitle');
  return t('evidencePack.title');
}

export function ReportsScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, reports, addReport, lockDelay } = useApp();
  const [busy, setBusy] = useState(false);
  if (!selectedProject)
    return (
      <ScreenShell>
        <EmptyState title={t('projects.noProjects')} />
      </ScreenShell>
    );
  const entries = state.diaryEntries.filter(
    item => item.projectId === selectedProject.id,
  );
  const delays = state.delayEvents.filter(
    item => item.projectId === selectedProject.id,
  );
  const projectReports = reports.filter(
    report => report.projectId === selectedProject.id,
  );

  const createDiaryReport = async () => {
    setBusy(true);
    try {
      let report;
      if (supabase) {
        report = await generateRemoteReport(selectedProject.id, 'diary');
      } else {
        const attachmentIds = new Set(
          entries.flatMap(entry => entry.evidence.attachmentIds),
        );
        const attachments = await inlinePdfAttachments(
          state.attachments.filter(attachment =>
            attachmentIds.has(attachment.id),
          ),
        );
        const pdf = await createPdf(
          diaryPdfHtml(selectedProject, entries, attachments, {
            requests: state.diaryApprovalRequests.filter(
              item => item.projectId === selectedProject.id,
            ),
            closures: state.dayClosures.filter(
              item => item.projectId === selectedProject.id,
            ),
          }),
        );
        report = reportFromPdf(
          selectedProject.ownerId,
          selectedProject.id,
          'diary',
          pdf.uri,
          pdf.pageCount,
          undefined,
          attachments.map(item => item.id),
        );
      }
      await addReport(report);
      Alert.alert(
        t('reports.diaryReport'),
        t('reports.generatedAt', { time: formatDateTime(report.createdAt) }),
        [{ text: t('app.close') }],
      );
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const createDelayReport = async (event?: DelayEvent) => {
    const target = event ?? delays[0];
    if (!target) {
      Alert.alert(t('dashboard.noRecords'));
      return;
    }
    setBusy(true);
    try {
      let report;
      if (supabase) {
        report = await generateRemoteReport(
          selectedProject.id,
          'delay',
          target.id,
        );
      } else {
        const reason =
          target.reason === 'bad_weather'
            ? t('delay.badWeather')
            : t('delay.investorWaiting');
        const attachmentIds = new Set(target.evidence.attachmentIds);
        const attachments = await inlinePdfAttachments(
          state.attachments.filter(attachment =>
            attachmentIds.has(attachment.id),
          ),
        );
        const pdf = await createPdf(
          delayPdfHtml(selectedProject, target, reason, attachments),
        );
        report = reportFromPdf(
          selectedProject.ownerId,
          selectedProject.id,
          'delay',
          pdf.uri,
          pdf.pageCount,
          target.id,
          attachments.map(item => item.id),
        );
      }
      await addReport(report);
      Alert.alert(
        t('reports.delayReport'),
        t('reports.generatedAt', { time: formatDateTime(report.createdAt) }),
      );
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title={t('reports.title')} onBack={() => navigation.goBack()} />
      <SecondaryButton
        title={t('clientShare.open')}
        icon={Eye}
        onPress={() => navigation.navigate('ClientShare')}
      />
      <SecondaryButton
        title={t('diaryApproval.open')}
        icon={FileCheck2}
        onPress={() => navigation.navigate('DiaryApprovals')}
      />
      {delays.map(event => (
        <Card key={event.id}>
          <Text style={styles.note}>
            {formatDateTime(event.eventDate)} ·{' '}
            {event.reason === 'bad_weather'
              ? t('delay.badWeather')
              : t('delay.investorWaiting')}
          </Text>
          {event.lockedAt ? (
            <SecondaryButton
              title={t('delay.correction')}
              onPress={() =>
                navigation.navigate('Delay', { correctionOfId: event.id })
              }
            />
          ) : (
            <SecondaryButton
              title={t('delay.lock')}
              onPress={() => void lockDelay(event.id)}
            />
          )}
          <SecondaryButton
            title={t('reports.create')}
            icon={FileText}
            onPress={() => void createDelayReport(event)}
            disabled={busy}
          />
        </Card>
      ))}
      {projectReports.map(report => (
        <Card key={report.id}>
          <PdfPreviewCard
            title={reportTitle(report.type)}
            project={selectedProject.name}
            date={formatDate(report.createdAt)}
            pageCount={report.pageCount}
          />
          <SecondaryButton
            title={t('reports.share')}
            icon={Share2}
            onPress={() => void shareReport(report)}
          />
        </Card>
      ))}
      {!projectReports.length ? (
        <EmptyState title={t('reports.noReports')} />
      ) : null}
      <PrimaryButton
        title={t('reports.diaryReport')}
        icon={FileText}
        onPress={() => void createDiaryReport()}
        disabled={busy}
      />
      <PrimaryButton
        title={t('reports.delayReport')}
        icon={FileText}
        onPress={() => void createDelayReport()}
        disabled={busy}
      />
      <Text style={styles.note}>{t('settings.limits')}</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
