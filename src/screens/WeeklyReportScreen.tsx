import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Eye,
  FileText,
  Save,
  Send,
  Share2,
  TriangleAlert,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TopBar,
} from '@/components/ui';
import type { DiaryEntry, WeeklyReport } from '@/domain/types';
import {
  buildWeeklyReportSnapshot,
  shiftWeeklyPeriod,
  validateWeeklyReport,
  weeklyPeriodForDate,
} from '@/domain/weeklyReport';
import { localDateIso } from '@/domain/ids';
import { formatEuroAmount } from '@/domain/receipts';
import { t } from '@/i18n';
import { formatDate, formatDateTime } from '@/i18n/format';
import {
  createWeeklyReportPdf,
  shareReport,
  uploadPrivateReport,
} from '@/services/pdf';
import { listDiaryRange } from '@/services/repositories';
import { supabase } from '@/services/supabase';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

function autoSummary(report: WeeklyReport['snapshot']): string {
  if (!report.completedTasks.length)
    return t('weeklyReport.autoNoCompleted');
  return t('weeklyReport.autoCompleted', {
    works: report.completedTasks.map(item => item.title).join(', '),
  });
}

function riskText(risk: WeeklyReport['snapshot']['scheduleRisk']): string {
  return t(`scheduleForecast.risk.${risk}.title`);
}

function Metric({
  value,
  label,
  danger,
}: {
  value: string | number;
  label: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, danger && styles.danger]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function WeeklyReportScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    saveWeeklyReport,
    publishWeeklyReport,
    addReport,
    syncNow,
    refreshProjectData,
    refreshGallery,
  } = useApp();
  const today = localDateIso();
  const currentPeriod = useMemo(() => weeklyPeriodForDate(today), [today]);
  const [period, setPeriod] = useState(currentPeriod);
  const [remoteDiary, setRemoteDiary] = useState<DiaryEntry[]>();
  const [summary, setSummary] = useState('');
  const [nextWeekPlan, setNextWeekPlan] = useState('');
  const [clientNote, setClientNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [creatingRevision, setCreatingRevision] = useState(false);
  const selectedReport = useMemo(
    () =>
      state.weeklyReports.find(
        item =>
          item.projectId === selectedProject?.id &&
          item.periodStart === period.periodStart,
      ),
    [period.periodStart, selectedProject?.id, state.weeklyReports],
  );
  const report = creatingRevision ? undefined : selectedReport;
  const diaryEntries = remoteDiary ?? state.diaryEntries;
  const liveSnapshot = useMemo(
    () =>
      selectedProject
        ? buildWeeklyReportSnapshot({
            projectId: selectedProject.id,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            generatedAt: new Date().toISOString(),
            today,
            tasks: state.siteTasks,
            diaryEntries,
            receipts: state.receipts,
            attachments: state.attachments,
            changeOrders: state.changeOrders,
            delays: state.delayEvents,
            materialRequests: state.materialRequests,
            schedule: state.projectSchedules.find(
              item => item.projectId === selectedProject.id,
            ),
          })
        : undefined,
    [
      diaryEntries,
      period.periodEnd,
      period.periodStart,
      selectedProject,
      state.attachments,
      state.changeOrders,
      state.delayEvents,
      state.materialRequests,
      state.projectSchedules,
      state.receipts,
      state.siteTasks,
      today,
    ],
  );
  const shownSnapshot = report?.status === 'published'
    ? report.snapshot
    : liveSnapshot;
  const selectedPhotos = shownSnapshot
    ? state.attachments
        .filter(item => shownSnapshot.attachmentIds.includes(item.id))
        .slice(0, 6)
    : [];
  const pdfExport = report
    ? state.reports.find(
        item => item.type === 'weekly' && item.sourceEntityId === report.id,
      )
    : undefined;

  useEffect(() => {
    void Promise.all([refreshProjectData(), refreshGallery()]);
  }, [refreshGallery, refreshProjectData]);
  useEffect(() => {
    if (!selectedProject || !supabase) {
      setRemoteDiary(undefined);
      return;
    }
    let active = true;
    void listDiaryRange(
      selectedProject.id,
      period.periodStart,
      period.periodEnd,
    )
      .then(entries => {
        if (active) setRemoteDiary(entries);
      })
      .catch(() => {
        if (active) setRemoteDiary(undefined);
      });
    return () => {
      active = false;
    };
  }, [period.periodEnd, period.periodStart, selectedProject?.id]);
  useEffect(() => {
    if (report) {
      setSummary(report.summary);
      setNextWeekPlan(report.nextWeekPlan);
      setClientNote(report.clientNote ?? '');
      return;
    }
    setSummary(liveSnapshot ? autoSummary(liveSnapshot) : '');
    const nextTasks = state.siteTasks
      .filter(
        item =>
          item.projectId === selectedProject?.id &&
          item.status !== 'done' &&
          (!item.dueDate || item.dueDate > period.periodEnd),
      )
      .slice(0, 4)
      .map(item => item.title);
    setNextWeekPlan(
      nextTasks.length
        ? t('weeklyReport.autoNext', { works: nextTasks.join(', ') })
        : t('weeklyReport.autoNoNext'),
    );
    setClientNote('');
  }, [
    period.periodStart,
    report?.id,
    report?.updatedAt,
    selectedProject?.id,
  ]);

  if (!selectedProject || !shownSnapshot)
    return (
      <ScreenShell>
        <TopBar
          title={t('weeklyReport.title')}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t('projects.noProjects')} />
      </ScreenShell>
    );

  const save = async (): Promise<WeeklyReport | undefined> => {
    const validation = validateWeeklyReport({
      ...period,
      summary,
      nextWeekPlan,
      clientNote,
    });
    if (validation !== 'ok') {
      Alert.alert(t(`weeklyReport.errors.${validation}`));
      return undefined;
    }
    return saveWeeklyReport({
      id: report?.status === 'draft' ? report.id : undefined,
      projectId: selectedProject.id,
      ...period,
      summary,
      nextWeekPlan,
      clientNote,
      snapshot: liveSnapshot ?? shownSnapshot,
    });
  };

  const saveDraft = async () => {
    setBusy(true);
    try {
      const saved = await save();
      if (!saved) return;
      setCreatingRevision(false);
      void syncNow();
      Alert.alert(t('weeklyReport.saved'));
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      const saved = await save();
      if (!saved) return;
      setCreatingRevision(false);
      const localPdf = await createWeeklyReportPdf({
        ownerId: selectedProject.ownerId,
        project: selectedProject,
        report: saved,
        attachments: state.attachments,
      });
      const storedPdf = supabase
        ? await uploadPrivateReport(localPdf, localPdf.storagePath!)
        : localPdf;
      await addReport(storedPdf);
      await publishWeeklyReport(
        saved.id,
        supabase ? storedPdf.id : undefined,
      );
      await syncNow();
      Alert.alert(t('weeklyReport.published'), t('weeklyReport.publishedHint'));
    } catch {
      Alert.alert(t('weeklyReport.publishFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirmPublish = () =>
    Alert.alert(
      t('weeklyReport.confirmTitle'),
      t('weeklyReport.confirmHint'),
      [
        { text: t('app.cancel'), style: 'cancel' },
        {
          text: t('weeklyReport.confirmAction'),
          onPress: () => void publish(),
        },
      ],
    );

  const shift = (weeks: number) => {
    setPeriod(shiftWeeklyPeriod(period.periodStart, weeks));
    setRemoteDiary(undefined);
  };

  const published = report?.status === 'published';
  return (
    <ScreenShell>
      <TopBar
        title={t('weeklyReport.title')}
        onBack={() => navigation.goBack()}
      />
      <Card style={styles.periodCard}>
        <View style={styles.periodHead}>
          <Pressable
            accessibilityLabel={t('weeklyReport.previous')}
            onPress={() => shift(-1)}
            style={styles.arrow}
          >
            <ArrowLeft color={colors.primaryDark} size={20} />
          </Pressable>
          <View style={styles.periodCenter}>
            <Text style={styles.eyebrow}>{t('weeklyReport.period')}</Text>
            <Text style={styles.periodText}>
              {formatDate(period.periodStart)} — {formatDate(period.periodEnd)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={t('weeklyReport.next')}
            accessibilityState={{
              disabled: period.periodStart >= currentPeriod.periodStart,
            }}
            disabled={period.periodStart >= currentPeriod.periodStart}
            onPress={() => shift(1)}
            style={[
              styles.arrow,
              period.periodStart >= currentPeriod.periodStart &&
                styles.disabled,
            ]}
          >
            <ArrowRight color={colors.primaryDark} size={20} />
          </Pressable>
        </View>
        <View style={styles.weekRail}>
          {Array.from({ length: 7 }, (_, index) => (
            <View style={styles.dayMark} key={index}>
              <View
                style={[
                  styles.dayDot,
                  index < Math.min(7, shownSnapshot.diaryEntryCount) &&
                    styles.dayDotActive,
                ]}
              />
            </View>
          ))}
        </View>
        <Text style={styles.railHint}>{t('weeklyReport.railHint')}</Text>
      </Card>

      {published ? (
        <Card style={styles.publishedCard}>
          <CheckCircle2 color={colors.primary} size={29} />
          <View style={styles.flex}>
            <Text style={styles.publishedTitle}>
              {t('weeklyReport.published')}
            </Text>
            <Text style={styles.meta}>
              {formatDateTime(report.publishedAt ?? report.updatedAt)}
            </Text>
          </View>
        </Card>
      ) : null}

      <View style={styles.metrics}>
        <Metric
          value={shownSnapshot.completedTasks.length}
          label={t('weeklyReport.completed')}
        />
        <Metric
          value={shownSnapshot.workerDays}
          label={t('weeklyReport.workerDays')}
        />
        <Metric
          value={shownSnapshot.blockedTaskCount}
          label={t('weeklyReport.blocked')}
          danger={shownSnapshot.blockedTaskCount > 0}
        />
        <Metric
          value={shownSnapshot.overdueTaskCount}
          label={t('weeklyReport.overdue')}
          danger={shownSnapshot.overdueTaskCount > 0}
        />
      </View>

      <Card
        style={{
          ...styles.riskCard,
          ...(shownSnapshot.scheduleRisk === 'critical' ||
          shownSnapshot.scheduleRisk === 'high'
            ? styles.riskDanger
            : {}),
        }}
      >
        {shownSnapshot.scheduleRisk === 'high' ||
        shownSnapshot.scheduleRisk === 'critical' ? (
          <TriangleAlert color={colors.danger} size={25} />
        ) : (
          <CalendarRange color={colors.primaryDark} size={25} />
        )}
        <View style={styles.flex}>
          <Text style={styles.riskTitle}>
            {riskText(shownSnapshot.scheduleRisk)}
          </Text>
          <Text style={styles.meta}>
            {shownSnapshot.forecastCompletionDate
              ? t('weeklyReport.forecast', {
                  date: formatDate(shownSnapshot.forecastCompletionDate),
                })
              : t('weeklyReport.noForecast')}
          </Text>
        </View>
      </Card>

      <TextArea
        label={t('weeklyReport.summary')}
        value={summary}
        onChangeText={setSummary}
        maxLength={1200}
        placeholder={t('weeklyReport.summaryPlaceholder')}
        editable={!published}
      />
      <TextArea
        label={t('weeklyReport.nextWeekPlan')}
        value={nextWeekPlan}
        onChangeText={setNextWeekPlan}
        maxLength={1200}
        placeholder={t('weeklyReport.nextWeekPlaceholder')}
        editable={!published}
      />
      <TextArea
        label={t('weeklyReport.clientNote')}
        value={clientNote}
        onChangeText={setClientNote}
        maxLength={800}
        placeholder={t('weeklyReport.clientNotePlaceholder')}
        editable={!published}
      />

      <Card style={styles.moneyCard}>
        <View>
          <Text style={styles.eyebrow}>{t('weeklyReport.verifiedSpend')}</Text>
          <Text style={styles.money}>
            {formatEuroAmount(shownSnapshot.verifiedSpendCents)}
          </Text>
        </View>
        <View style={styles.moneyDivider} />
        <View>
          <Text style={styles.eyebrow}>{t('weeklyReport.acceptedChanges')}</Text>
          <Text style={styles.money}>
            {formatEuroAmount(shownSnapshot.acceptedChangeCents)}
          </Text>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{t('weeklyReport.completedWorks')}</Text>
      {shownSnapshot.completedTasks.map(task => (
        <Card key={task.id} style={styles.taskCard}>
          <CheckCircle2 color={colors.primary} size={21} />
          <View style={styles.flex}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.meta}>
              {formatDate(task.completedAt)} ·{' '}
              {t('weeklyReport.photoCount', {
                count: task.attachmentIds.length,
              })}
            </Text>
          </View>
        </Card>
      ))}
      {!shownSnapshot.completedTasks.length ? (
        <EmptyState
          title={t('weeklyReport.noCompleted')}
          hint={t('weeklyReport.noCompletedHint')}
        />
      ) : null}

      {selectedPhotos.length ? (
        <>
          <Text style={styles.sectionTitle}>{t('weeklyReport.photos')}</Text>
          <View style={styles.photos}>
            {selectedPhotos.map(photo => (
              <Image
                key={photo.id}
                source={{ uri: photo.localUri }}
                style={styles.photo}
                accessibilityLabel={t('weeklyReport.photos')}
              />
            ))}
          </View>
        </>
      ) : null}

      {!published ? (
        <>
          <SecondaryButton
            title={t('weeklyReport.saveDraft')}
            icon={Save}
            disabled={busy}
            onPress={() => void saveDraft()}
          />
          <PrimaryButton
            title={t('weeklyReport.publish')}
            icon={Send}
            disabled={busy}
            onPress={confirmPublish}
          />
          <Card style={styles.confirmation}>
            <Text style={styles.confirmationText}>
              {t('weeklyReport.immutableHint')}
            </Text>
          </Card>
        </>
      ) : (
        <>
          {pdfExport ? (
            <PrimaryButton
              title={t('weeklyReport.sharePdf')}
              icon={Share2}
              onPress={() => void shareReport(pdfExport)}
            />
          ) : null}
          <SecondaryButton
            title={t('weeklyReport.openClientView')}
            icon={Eye}
            onPress={() => navigation.navigate('ClientShare')}
          />
          <SecondaryButton
            title={t('weeklyReport.newEdition')}
            icon={FileText}
            onPress={() => setCreatingRevision(true)}
          />
        </>
      )}

      <Text style={styles.sectionTitle}>{t('weeklyReport.history')}</Text>
      {state.weeklyReports
        .filter(
          item =>
            item.projectId === selectedProject.id &&
            item.status === 'published' &&
            item.id !== report?.id,
        )
        .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
        .map(item => (
          <Pressable
            key={item.id}
            onPress={() =>
              setPeriod({
                periodStart: item.periodStart,
                periodEnd: item.periodEnd,
              })
            }
          >
            <Card style={styles.historyCard}>
              <FileText color={colors.primaryDark} size={22} />
              <View style={styles.flex}>
                <Text style={styles.taskTitle}>
                  {formatDate(item.periodStart)} — {formatDate(item.periodEnd)}
                </Text>
                <Text style={styles.meta}>
                  {t('weeklyReport.historyMeta', {
                    completed: item.snapshot.completedTasks.length,
                    photos: item.snapshot.attachmentIds.length,
                  })}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  disabled: { opacity: 0.3 },
  periodCard: {
    borderTopWidth: 5,
    borderTopColor: '#C8A96B',
    backgroundColor: '#F7F4EC',
  },
  periodHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  arrow: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#C8A96B',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  periodCenter: { flex: 1, alignItems: 'center' },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  periodText: {
    color: colors.primaryDark,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '900',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  weekRail: {
    height: 20,
    borderTopWidth: 3,
    borderTopColor: '#C8A96B',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: spacing.sm,
  },
  dayMark: {
    width: 14,
    alignItems: 'center',
    marginTop: -7,
  },
  dayDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#C8A96B',
    backgroundColor: '#F7F4EC',
  },
  dayDotActive: { backgroundColor: colors.primaryDark },
  railHint: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  publishedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  publishedTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '900' },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  metrics: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  metric: {
    flex: 1,
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  metricValue: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
  },
  danger: { color: colors.danger },
  riskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: '#C8A96B',
  },
  riskDanger: { borderLeftColor: colors.danger, backgroundColor: '#FDE8E5' },
  riskTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  moneyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#173F35',
  },
  money: {
    color: colors.surface,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 5,
    fontVariant: ['tabular-nums'],
  },
  moneyDivider: { width: 1, backgroundColor: '#FFFFFF35' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  taskCard: { flexDirection: 'row', alignItems: 'center' },
  taskTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: {
    width: '48%',
    aspectRatio: 4 / 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  confirmation: { backgroundColor: colors.warningSoft },
  confirmationText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  historyCard: { flexDirection: 'row', alignItems: 'center' },
});
