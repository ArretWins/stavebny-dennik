import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  PackageSearch,
  Pencil,
  Save,
  UserRoundX,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
} from '@/components/ui';
import {
  projectScheduleForecast,
  validateProjectSchedule,
  type LookaheadTone,
} from '@/domain/scheduleForecast';
import { localDateIso } from '@/domain/ids';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

const toneColors: Record<LookaheadTone, string> = {
  ready: colors.primary,
  blocked: colors.warning,
  overdue: colors.danger,
  material: '#9A6A12',
  unassigned: '#6B7280',
};

function Metric({
  value,
  label,
  danger,
}: {
  value: number;
  label: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, danger && styles.metricDanger]}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function ScheduleForecastScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    saveProjectSchedule,
    syncNow,
    refreshProjectData,
  } = useApp();
  const schedule = state.projectSchedules.find(
    item => item.projectId === selectedProject?.id,
  );
  const [editing, setEditing] = useState(!schedule);
  const [startDate, setStartDate] = useState(
    schedule?.startDate ?? localDateIso(),
  );
  const [targetDate, setTargetDate] = useState(
    schedule?.targetCompletionDate ?? '',
  );
  const [note, setNote] = useState(schedule?.note ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refreshProjectData();
  }, [refreshProjectData]);
  useEffect(() => {
    if (!schedule) return;
    setStartDate(schedule.startDate);
    setTargetDate(schedule.targetCompletionDate);
    setNote(schedule.note ?? '');
    setEditing(false);
  }, [schedule?.updatedAt]);
  const requestNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const request of state.materialRequests) {
      const items = state.materialRequestItems
        .filter(item => item.requestId === request.id)
        .map(item => item.name);
      if (items.length) names[request.id] = items.slice(0, 3).join(', ');
    }
    return names;
  }, [state.materialRequestItems, state.materialRequests]);
  const forecast = useMemo(
    () =>
      projectScheduleForecast({
        projectId: selectedProject?.id ?? '',
        today: localDateIso(),
        schedule,
        tasks: state.siteTasks,
        delays: state.delayEvents,
        materialRequests: state.materialRequests,
        changeOrders: state.changeOrders,
        materialRequestNames: requestNames,
      }),
    [
      requestNames,
      schedule,
      selectedProject?.id,
      state.changeOrders,
      state.delayEvents,
      state.materialRequests,
      state.siteTasks,
    ],
  );
  const risk =
    forecast.risk === 'critical'
      ? {
          title: t('scheduleForecast.criticalTitle'),
          hint: t('scheduleForecast.criticalHint'),
          color: colors.danger,
          background: '#FDE8E5',
        }
      : forecast.risk === 'high'
        ? {
            title: t('scheduleForecast.highTitle'),
            hint: t('scheduleForecast.highHint'),
            color: colors.warning,
            background: colors.warningSoft,
          }
        : forecast.risk === 'watch'
          ? {
              title: t('scheduleForecast.watchTitle'),
              hint: t('scheduleForecast.watchHint'),
              color: '#9A6A12',
              background: '#FFF5D8',
            }
          : {
              title: t('scheduleForecast.onTrackTitle'),
              hint: t('scheduleForecast.onTrackHint'),
              color: colors.primary,
              background: colors.primarySoft,
            };

  const save = async () => {
    const validation = validateProjectSchedule({
      startDate,
      targetCompletionDate: targetDate,
      note,
    });
    if (validation !== 'ok') {
      Alert.alert(
        t(
          validation === 'start'
            ? 'scheduleForecast.invalidStart'
            : validation === 'target'
              ? 'scheduleForecast.invalidTarget'
              : validation === 'range'
                ? 'scheduleForecast.invalidRange'
                : 'scheduleForecast.invalidNote',
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await saveProjectSchedule(startDate, targetDate, note);
      void syncNow().catch(() => undefined);
      setEditing(false);
      Alert.alert(t('scheduleForecast.saved'));
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar
        title={t('scheduleForecast.title')}
        onBack={() => navigation.goBack()}
      />
      {editing ? (
        <Card style={styles.setupCard}>
          <View style={styles.setupHead}>
            <View style={styles.setupIcon}>
              <CalendarClock color={colors.primaryDark} size={27} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>
                {t('scheduleForecast.setupTitle')}
              </Text>
              <Text style={styles.meta}>{t('scheduleForecast.setupHint')}</Text>
            </View>
          </View>
          <TextField
            label={t('scheduleForecast.startDate')}
            value={startDate}
            onChangeText={setStartDate}
            placeholder={t('scheduleForecast.datePlaceholder')}
            autoCapitalize="none"
          />
          <TextField
            label={t('scheduleForecast.targetDate')}
            value={targetDate}
            onChangeText={setTargetDate}
            placeholder={t('scheduleForecast.datePlaceholder')}
            autoCapitalize="none"
          />
          <TextArea
            label={t('scheduleForecast.note')}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            placeholder={t('scheduleForecast.notePlaceholder')}
          />
          <PrimaryButton
            title={t('scheduleForecast.save')}
            icon={Save}
            disabled={busy}
            onPress={() => void save()}
          />
        </Card>
      ) : (
        <>
          <Card
            style={{
              ...styles.riskCard,
              borderLeftColor: risk.color,
              backgroundColor: risk.background,
            }}
          >
            {forecast.risk === 'on_track' ? (
              <CheckCircle2 color={risk.color} size={31} />
            ) : (
              <AlertTriangle color={risk.color} size={31} />
            )}
            <View style={styles.flex}>
              <Text style={styles.riskTitle}>{risk.title}</Text>
              <Text style={styles.meta}>{risk.hint}</Text>
            </View>
          </Card>
          <Card style={styles.deadlineCard}>
            <View style={styles.deadlineColumn}>
              <Text style={styles.deadlineLabel}>
                {t('scheduleForecast.originalTarget')}
              </Text>
              <Text style={styles.deadlineValue}>
                {formatDate(schedule?.targetCompletionDate ?? '')}
              </Text>
            </View>
            <View style={styles.deadlineConnector} />
            <View style={styles.deadlineColumn}>
              <Text style={styles.deadlineLabel}>
                {t('scheduleForecast.forecastTarget')}
              </Text>
              <Text
                style={[
                  styles.deadlineValue,
                  forecast.risk === 'critical' && styles.deadlineDanger,
                ]}
              >
                {formatDate(forecast.forecastCompletionDate ?? '')}
              </Text>
            </View>
          </Card>
          <View style={styles.metrics}>
            <Metric
              value={forecast.overdueTaskCount}
              label={t('scheduleForecast.overdue')}
              danger={forecast.overdueTaskCount > 0}
            />
            <Metric
              value={forecast.blockedTaskCount}
              label={t('scheduleForecast.blocked')}
              danger={forecast.blockedTaskCount > 0}
            />
            <Metric
              value={forecast.unassignedTaskCount}
              label={t('scheduleForecast.unassigned')}
            />
            <Metric
              value={forecast.materialRiskCount}
              label={t('scheduleForecast.materialRisks')}
            />
          </View>
          <Card style={styles.dayLedger}>
            <View style={styles.dayRow}>
              <Text style={styles.dayLabel}>
                {t('scheduleForecast.acceptedDays')}
              </Text>
              <Text style={styles.dayValue}>
                {forecast.acceptedChangeDays > 0 ? '+' : ''}
                {forecast.acceptedChangeDays}
              </Text>
            </View>
            <View style={styles.dayRow}>
              <Text style={styles.dayLabel}>
                {t('scheduleForecast.confirmedDelays')}
              </Text>
              <Text style={styles.dayValue}>+{forecast.confirmedDelayDays}</Text>
            </View>
            <View style={styles.dayRow}>
              <Text style={styles.dayLabel}>
                {t('scheduleForecast.pendingDays')}
              </Text>
              <Text style={styles.pendingDayValue}>
                {forecast.pendingChangeDays > 0 ? '+' : ''}
                {forecast.pendingChangeDays}
              </Text>
            </View>
          </Card>
          <View style={styles.actions}>
            <SecondaryButton
              title={t('scheduleForecast.edit')}
              icon={Pencil}
              style={styles.flex}
              onPress={() => setEditing(true)}
            />
            <SecondaryButton
              title={t('changeOrders.title')}
              icon={CalendarClock}
              style={styles.flex}
              onPress={() => navigation.navigate('ChangeOrders')}
            />
          </View>
          <Text style={styles.sectionTitle}>
            {t('scheduleForecast.timelineTitle')}
          </Text>
          {forecast.lookahead.length ? (
            <View style={styles.timeline}>
              {forecast.lookahead.map(item => {
                const color = toneColors[item.tone];
                const Icon =
                  item.tone === 'material'
                    ? PackageSearch
                    : item.tone === 'unassigned'
                      ? UserRoundX
                      : CircleDot;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={item.id}
                    onPress={() =>
                      item.kind === 'task' && item.taskId
                        ? navigation.navigate('TaskEditor', {
                            taskId: item.taskId,
                          })
                        : navigation.navigate('Workforce')
                    }
                    style={styles.timelineItem}
                  >
                    <View style={[styles.timelineDot, { backgroundColor: color }]} />
                    <View style={styles.dateRail}>
                      <Text style={styles.itemDate}>{formatDate(item.date)}</Text>
                      <Text style={[styles.tone, { color }]}>
                        {t(`scheduleForecast.tone.${item.tone}`)}
                      </Text>
                    </View>
                    <View style={styles.itemBody}>
                      <View style={styles.itemType}>
                        <Icon color={color} size={16} />
                        <Text style={styles.itemTypeText}>
                          {t(
                            item.kind === 'task'
                              ? 'scheduleForecast.task'
                              : 'scheduleForecast.material',
                          )}
                        </Text>
                      </View>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <EmptyState
              title={t('scheduleForecast.noItems')}
              hint={t('scheduleForecast.noItemsHint')}
            />
          )}
          <Card style={styles.methodology}>
            <Text style={styles.methodologyText}>
              {t('scheduleForecast.methodology')}
            </Text>
          </Card>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  setupCard: { borderTopWidth: 5, borderTopColor: colors.primaryDark },
  setupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  setupIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: '#E8EFEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  riskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 6,
  },
  riskTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F4EC',
    borderColor: '#C8A96B',
  },
  deadlineColumn: { flex: 1 },
  deadlineLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  deadlineValue: {
    color: colors.primaryDark,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 5,
  },
  deadlineDanger: { color: colors.danger },
  deadlineConnector: {
    width: 32,
    height: 2,
    backgroundColor: '#C8A96B',
    marginHorizontal: spacing.sm,
  },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metric: {
    flex: 1,
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  metricValue: {
    color: colors.primaryDark,
    fontSize: 23,
    fontWeight: '900',
  },
  metricDanger: { color: colors.danger },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
    marginTop: 3,
  },
  dayLedger: { gap: 0, paddingVertical: spacing.sm },
  dayRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayLabel: { color: colors.textMuted, fontSize: 12 },
  dayValue: { color: colors.primaryDark, fontSize: 14, fontWeight: '900' },
  pendingDayValue: { color: colors.warning, fontSize: 14, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: spacing.md },
  timeline: {
    borderLeftWidth: 2,
    borderLeftColor: '#C8A96B',
    marginLeft: spacing.md,
  },
  timelineItem: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  timelineDot: {
    position: 'absolute',
    left: -6,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dateRail: { width: 88 },
  itemDate: { color: colors.text, fontSize: 11, fontWeight: '800' },
  tone: { fontSize: 9, fontWeight: '900', marginTop: 4 },
  itemBody: { flex: 1, gap: spacing.xs },
  itemType: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemTypeText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  methodology: { backgroundColor: colors.surfaceAlt },
  methodologyText: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
});

