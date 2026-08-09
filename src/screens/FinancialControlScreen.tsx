import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  BadgeEuro,
  CircleGauge,
  FileCheck2,
  FilePenLine,
  Pencil,
  Save,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react-native';
import {
  Card,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
} from '@/components/ui';
import {
  projectCostForecast,
  projectFinancialSummary,
  validateProjectBudget,
} from '@/domain/financialControl';
import { projectScheduleForecast } from '@/domain/scheduleForecast';
import { projectProcurementCommitmentCents } from '@/domain/procurement';
import { localDateIso } from '@/domain/ids';
import { formatEuroAmount, parseEuroAmount } from '@/domain/receipts';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

function signedMoney(value: number): string {
  return `${value > 0 ? '+' : ''}${formatEuroAmount(value)}`;
}

function LedgerRow({
  label,
  value,
  strong,
  warning,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warning?: boolean;
}) {
  return (
    <View style={[styles.ledgerRow, strong && styles.ledgerRowStrong]}>
      <Text style={[styles.ledgerLabel, strong && styles.ledgerLabelStrong]}>
        {label}
      </Text>
      <Text
        style={[
          styles.ledgerValue,
          strong && styles.ledgerValueStrong,
          warning && styles.warningValue,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function FinancialControlScreen({ navigation }: { navigation: any }) {
  const {
    selectedProject,
    state,
    saveProjectBudget,
    syncNow,
    refreshProjectData,
  } = useApp();
  const budget = state.projectBudgets.find(
    item => item.projectId === selectedProject?.id,
  );
  const [editing, setEditing] = useState(!budget);
  const [baseline, setBaseline] = useState(
    budget
      ? (budget.baselineBudgetCents / 100).toFixed(2).replace('.', ',')
      : '',
  );
  const [contingency, setContingency] = useState(
    budget
      ? (budget.contingencyCents / 100).toFixed(2).replace('.', ',')
      : '0,00',
  );
  const [commitments, setCommitments] = useState(
    budget
      ? ((budget.remainingCommitmentCents ?? 0) / 100)
          .toFixed(2)
          .replace('.', ',')
      : '0,00',
  );
  const [note, setNote] = useState(budget?.note ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refreshProjectData();
  }, [refreshProjectData]);
  useEffect(() => {
    if (!budget) return;
    setBaseline(
      (budget.baselineBudgetCents / 100).toFixed(2).replace('.', ','),
    );
    setContingency(
      (budget.contingencyCents / 100).toFixed(2).replace('.', ','),
    );
    setCommitments(
      ((budget.remainingCommitmentCents ?? 0) / 100)
        .toFixed(2)
        .replace('.', ','),
    );
    setNote(budget.note ?? '');
    setEditing(false);
  }, [budget?.updatedAt]);
  const projectReceipts = useMemo(
    () =>
      state.receipts.filter(item => item.projectId === selectedProject?.id),
    [selectedProject?.id, state.receipts],
  );
  const projectChanges = useMemo(
    () =>
      state.changeOrders.filter(item => item.projectId === selectedProject?.id),
    [selectedProject?.id, state.changeOrders],
  );
  const summary = useMemo(
    () => {
      const procurementCommitmentCents = selectedProject
        ? projectProcurementCommitmentCents({
            projectId: selectedProject.id,
            requests: state.materialRequests,
            quotes: state.materialSupplierQuotes ?? [],
            receiptLinks: state.receiptRequestLinks,
          })
        : 0;
      return (
      projectFinancialSummary({
        budget,
        receipts: projectReceipts,
        categories: state.receiptCategories,
        changeOrders: projectChanges,
        procurementCommitmentCents,
      })
      );
    },
    [
      budget,
      projectChanges,
      projectReceipts,
      selectedProject,
      state.materialRequests,
      state.materialSupplierQuotes,
      state.receiptCategories,
      state.receiptRequestLinks,
    ],
  );
  const projectSchedule = state.projectSchedules.find(
    item => item.projectId === selectedProject?.id,
  );
  const scheduleSummary = useMemo(
    () =>
      selectedProject
        ? projectScheduleForecast({
            projectId: selectedProject.id,
            today: localDateIso(),
            schedule: projectSchedule,
            tasks: state.siteTasks,
            delays: state.delayEvents,
            materialRequests: state.materialRequests,
            changeOrders: projectChanges,
          })
        : undefined,
    [
      projectChanges,
      projectSchedule,
      selectedProject,
      state.delayEvents,
      state.materialRequests,
      state.siteTasks,
    ],
  );
  const costForecast = useMemo(
    () =>
      projectCostForecast({
        summary,
        budget,
        receipts: projectReceipts,
        today: localDateIso(),
        scheduleStartDate: projectSchedule?.startDate,
        forecastCompletionDate: scheduleSummary?.forecastCompletionDate,
      }),
    [budget, projectReceipts, projectSchedule?.startDate, scheduleSummary, summary],
  );
  const usageWidth = `${Math.min(100, Math.max(0, summary.utilization * 100))}%`;
  const reserveWidth =
    summary.adjustedBudgetCents > 0
      ? `${Math.min(
          100,
          Math.max(
            0,
            (summary.contingencyCents / summary.adjustedBudgetCents) * 100,
          ),
        )}%`
      : '0%';
  const actualPercent =
    summary.adjustedBudgetCents > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (summary.documentedSpendCents / summary.adjustedBudgetCents) * 100,
          ),
        )
      : 0;
  const commitmentsPercent =
    summary.adjustedBudgetCents > 0
      ? Math.min(
          100 - actualPercent,
          Math.max(
            0,
            (summary.totalCommitmentCents /
              summary.adjustedBudgetCents) *
              100,
          ),
        )
      : 0;
  const forecastPercent =
    summary.adjustedBudgetCents > 0 && costForecast.forecastFinalCostCents
      ? Math.min(
          100,
          Math.max(
            0,
            (costForecast.forecastFinalCostCents /
              summary.adjustedBudgetCents) *
              100,
          ),
        )
      : 0;
  const health =
    summary.health === 'over'
      ? {
          title: t('financial.overTitle'),
          hint: t('financial.overHint'),
          color: colors.danger,
          background: '#FDE8E5',
        }
      : summary.health === 'watch'
        ? {
            title: t('financial.watchTitle'),
            hint: t('financial.watchHint'),
            color: colors.warning,
            background: colors.warningSoft,
          }
        : {
            title: t('financial.healthyTitle'),
            hint: t('financial.healthyHint'),
            color: colors.primary,
            background: colors.primarySoft,
          };

  const save = async () => {
    const baselineCents = parseEuroAmount(baseline);
    const contingencyCents = parseEuroAmount(contingency);
    const remainingCommitmentCents = parseEuroAmount(commitments);
    const validation = validateProjectBudget({
      baselineBudgetCents: baselineCents,
      contingencyCents,
      remainingCommitmentCents,
      note,
    });
    if (validation !== 'ok') {
      Alert.alert(
        t(
          validation === 'baseline'
            ? 'financial.invalidBaseline'
            : validation === 'contingency'
              ? 'financial.invalidContingency'
              : validation === 'commitments'
                ? 'financial.invalidCommitments'
                : 'financial.invalidNote',
        ),
      );
      return;
    }
    if (
      baselineCents === undefined ||
      contingencyCents === undefined ||
      remainingCommitmentCents === undefined
    )
      return;
    setBusy(true);
    try {
      await saveProjectBudget(
        baselineCents,
        contingencyCents,
        remainingCommitmentCents,
        note,
      );
      void syncNow().catch(() => undefined);
      setEditing(false);
      Alert.alert(t('financial.saved'));
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title={t('financial.title')} onBack={() => navigation.goBack()} />
      {editing ? (
        <Card style={styles.setupCard}>
          <View style={styles.setupHead}>
            <View style={styles.setupIcon}>
              <BadgeEuro color={colors.primaryDark} size={27} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>{t('financial.setupTitle')}</Text>
              <Text style={styles.meta}>{t('financial.setupHint')}</Text>
            </View>
          </View>
          <TextField
            label={t('financial.baselineLabel')}
            value={baseline}
            onChangeText={setBaseline}
            keyboardType="decimal-pad"
            placeholder="150 000,00"
          />
          <TextField
            label={t('financial.contingencyLabel')}
            value={contingency}
            onChangeText={setContingency}
            keyboardType="decimal-pad"
            placeholder="10 000,00"
          />
          <TextField
            label={t('financial.commitmentsLabel')}
            value={commitments}
            onChangeText={setCommitments}
            keyboardType="decimal-pad"
            placeholder="35 000,00"
          />
          <Text style={styles.fieldHint}>
            {t('financial.commitmentsHint')}
          </Text>
          <TextArea
            label={t('financial.noteLabel')}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            placeholder={t('financial.notePlaceholder')}
          />
          <PrimaryButton
            title={t('financial.save')}
            icon={Save}
            disabled={busy}
            onPress={() => void save()}
          />
        </Card>
      ) : (
        <>
          <Card
            style={{
              ...styles.healthCard,
              borderLeftColor: health.color,
              backgroundColor: health.background,
            }}
          >
            {summary.health === 'healthy' ? (
              <ShieldCheck color={health.color} size={31} />
            ) : (
              <TriangleAlert color={health.color} size={31} />
            )}
            <View style={styles.flex}>
              <Text style={styles.healthTitle}>{health.title}</Text>
              <Text style={styles.meta}>{health.hint}</Text>
            </View>
          </Card>
          <Card
            style={{
              ...styles.forecastCard,
              borderTopColor:
                costForecast.health === 'over_budget'
                  ? colors.danger
                  : costForecast.health === 'reserve_at_risk'
                    ? colors.warning
                    : '#173F35',
            }}
          >
            <View style={styles.forecastHeader}>
              <View style={styles.flex}>
                <Text style={styles.stripEyebrow}>
                  {t('financial.finalCostForecast')}
                </Text>
                <Text
                  style={[
                    styles.forecastValue,
                    costForecast.health === 'over_budget' && styles.negative,
                  ]}
                >
                  {costForecast.forecastFinalCostCents !== undefined
                    ? formatEuroAmount(costForecast.forecastFinalCostCents)
                    : '—'}
                </Text>
              </View>
              <View style={styles.confidenceBadge}>
                <Text style={styles.confidenceLabel}>
                  {t('financial.confidence')}
                </Text>
                <Text style={styles.confidenceValue}>
                  {t(`financial.confidenceLevel.${costForecast.confidence}`)}
                </Text>
              </View>
            </View>
            {costForecast.available ? (
              <>
                <View style={styles.surveyTrack}>
                  <View
                    style={[
                      styles.surveyActual,
                      { width: `${actualPercent}%` as `${number}%` },
                    ]}
                  />
                  <View
                    style={[
                      styles.surveyCommitments,
                      {
                        left: `${actualPercent}%` as `${number}%`,
                        width: `${commitmentsPercent}%` as `${number}%`,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.surveyReserve,
                      { width: reserveWidth as `${number}%` },
                    ]}
                  />
                  <View
                    style={[
                      styles.surveyMarker,
                      {
                        left: `${forecastPercent}%` as `${number}%`,
                        backgroundColor:
                          costForecast.health === 'over_budget'
                            ? colors.danger
                            : costForecast.health === 'reserve_at_risk'
                              ? colors.warning
                              : '#173F35',
                      },
                    ]}
                  />
                </View>
                <View style={styles.surveyLabels}>
                  <Text style={styles.legendText}>
                    {t('financial.documentedShort')}
                  </Text>
                  <Text style={styles.legendText}>
                    {t('financial.commitmentsShort')}
                  </Text>
                  <Text style={[styles.legendText, styles.alignRight]}>
                    {t('financial.approvedLimit')}
                  </Text>
                </View>
                <View
                  style={[
                    styles.forecastVerdict,
                    costForecast.health === 'over_budget'
                      ? styles.forecastVerdictDanger
                      : costForecast.health === 'reserve_at_risk'
                        ? styles.forecastVerdictWarning
                        : styles.forecastVerdictSafe,
                  ]}
                >
                  {costForecast.health === 'within_budget' ? (
                    <ShieldCheck color={colors.primaryDark} size={23} />
                  ) : (
                    <TriangleAlert
                      color={
                        costForecast.health === 'over_budget'
                          ? colors.danger
                          : colors.warning
                      }
                      size={23}
                    />
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.verdictTitle}>
                      {t(`financial.forecastHealth.${costForecast.health}.title`)}
                    </Text>
                    <Text style={styles.meta}>
                      {t(`financial.forecastHealth.${costForecast.health}.hint`, {
                        amount: formatEuroAmount(
                          Math.abs(costForecast.projectedVarianceCents ?? 0),
                        ),
                      })}
                    </Text>
                  </View>
                </View>
                <View style={styles.forecastLedger}>
                  <LedgerRow
                    label={t('financial.declaredFinal')}
                    value={formatEuroAmount(
                      costForecast.declaredFinalCostCents,
                    )}
                  />
                  <LedgerRow
                    label={t('financial.paceScenario')}
                    value={
                      costForecast.paceProjectedFinalCents !== undefined
                        ? formatEuroAmount(
                            costForecast.paceProjectedFinalCents,
                          )
                        : '—'
                    }
                  />
                  <LedgerRow
                    label={t('financial.projectedVariance')}
                    value={signedMoney(
                      costForecast.projectedVarianceCents ?? 0,
                    )}
                    warning={(costForecast.projectedVarianceCents ?? 0) > 0}
                    strong
                  />
                </View>
                <Text style={styles.methodText}>
                  {t('financial.forecastMethod', {
                    days: costForecast.elapsedDays ?? 0,
                    total: costForecast.totalDays ?? 0,
                    receipts: costForecast.receiptCount,
                  })}
                </Text>
              </>
            ) : (
              <View style={styles.forecastEmpty}>
                <Text style={styles.forecastEmptyTitle}>
                  {t('financial.forecastUnavailable')}
                </Text>
                <Text style={styles.meta}>
                  {t('financial.forecastUnavailableHint')}
                </Text>
                <View style={styles.actions}>
                  <SecondaryButton
                    title={t('financial.addCommitments')}
                    icon={Pencil}
                    style={styles.flex}
                    onPress={() => setEditing(true)}
                  />
                  <SecondaryButton
                    title={t('financial.openSchedule')}
                    icon={CircleGauge}
                    style={styles.flex}
                    onPress={() => navigation.navigate('ScheduleForecast')}
                  />
                </View>
              </View>
            )}
          </Card>
          <Card style={styles.controlStrip}>
            <View style={styles.stripHead}>
              <View>
                <Text style={styles.stripEyebrow}>
                  {t('financial.forecastRemaining')}
                </Text>
                <Text
                  style={[
                    styles.stripValue,
                    summary.forecastRemainingCents < 0 && styles.negative,
                  ]}
                >
                  {formatEuroAmount(summary.forecastRemainingCents)}
                </Text>
              </View>
              <View style={styles.usageBadge}>
                <CircleGauge color={colors.primaryDark} size={18} />
                <Text style={styles.usageText}>
                  {Math.round(summary.utilization * 100)}%
                </Text>
              </View>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.used,
                  {
                    width: usageWidth as `${number}%`,
                    backgroundColor:
                      summary.health === 'over'
                        ? colors.danger
                        : summary.health === 'watch'
                          ? colors.warning
                          : colors.primary,
                  },
                ]}
              />
              <View
                style={[
                  styles.reserve,
                  { width: reserveWidth as `${number}%` },
                ]}
              />
            </View>
            <View style={styles.trackLegend}>
              <Text style={styles.legendText}>
                {t('financial.documentedSpend')}{' '}
                {formatEuroAmount(summary.documentedSpendCents)}
              </Text>
              <Text style={styles.legendText}>
                {t('financial.afterReserve')}{' '}
                {formatEuroAmount(summary.remainingAfterReserveCents)}
              </Text>
            </View>
          </Card>
          <Card style={styles.ledger}>
            <LedgerRow
              label={t('financial.baseline')}
              value={formatEuroAmount(summary.baselineBudgetCents)}
            />
            <LedgerRow
              label={t('financial.acceptedChanges')}
              value={signedMoney(summary.acceptedChangeCents)}
            />
            <LedgerRow
              label={t('financial.adjustedBudget')}
              value={formatEuroAmount(summary.adjustedBudgetCents)}
              strong
            />
            <LedgerRow
              label={t('financial.verifiedSpend')}
              value={formatEuroAmount(summary.verifiedSpendCents)}
            />
            <LedgerRow
              label={t('financial.reviewSpend')}
              value={formatEuroAmount(summary.reviewSpendCents)}
              warning={summary.reviewSpendCents > 0}
            />
            <LedgerRow
              label={t('financial.procurementCommitments')}
              value={formatEuroAmount(summary.procurementCommitmentCents)}
              warning={summary.procurementCommitmentCents > 0}
            />
            <LedgerRow
              label={t('financial.pendingChanges')}
              value={signedMoney(summary.pendingChangeCents)}
              warning={summary.pendingChangeCents !== 0}
            />
          </Card>
          <View style={styles.actions}>
            <SecondaryButton
              title={t('financial.edit')}
              icon={Pencil}
              style={styles.flex}
              onPress={() => setEditing(true)}
            />
            <SecondaryButton
              title={t('financial.openChanges')}
              icon={FilePenLine}
              style={styles.flex}
              onPress={() => navigation.navigate('ChangeOrders')}
            />
          </View>
          {summary.reviewReceiptCount ? (
            <SecondaryButton
              title={t('financial.reviewReceipts', {
                count: summary.reviewReceiptCount,
              })}
              icon={FileCheck2}
              onPress={() => navigation.navigate('Receipts')}
            />
          ) : null}
          <Text style={styles.sectionTitle}>{t('financial.costStructure')}</Text>
          <Card>
            {summary.categories.length ? (
              summary.categories.map(category => (
                <View style={styles.category} key={category.categoryId ?? 'none'}>
                  <View style={styles.categoryHead}>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryAmount}>
                      {formatEuroAmount(category.amountCents)}
                    </Text>
                  </View>
                  <View style={styles.categoryTrack}>
                    <View
                      style={[
                        styles.categoryFill,
                        {
                          width: `${Math.max(
                            2,
                            Math.round(category.share * 100),
                          )}%` as `${number}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.meta}>{t('financial.noCosts')}</Text>
            )}
          </Card>
          <Card style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>{t('financial.disclaimer')}</Text>
          </Card>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  setupCard: { borderTopWidth: 5, borderTopColor: '#C8A96B' },
  setupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  setupIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: '#EFE6D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  fieldHint: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -spacing.sm,
  },
  healthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 6,
  },
  healthTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  forecastCard: {
    borderTopWidth: 6,
    backgroundColor: '#F7F9F7',
    gap: spacing.md,
  },
  forecastHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  forecastValue: {
    color: '#173F35',
    fontSize: 32,
    fontWeight: '900',
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  confidenceBadge: {
    minWidth: 92,
    borderWidth: 1,
    borderColor: '#B8C8C0',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  confidenceLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  confidenceValue: {
    color: '#173F35',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  surveyTrack: {
    height: 22,
    borderRadius: 3,
    backgroundColor: '#E2E8E4',
    borderWidth: 1,
    borderColor: '#CAD5CF',
    overflow: 'hidden',
  },
  surveyActual: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#315F50',
  },
  surveyCommitments: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#88A99A',
  },
  surveyReserve: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#C8A96B',
    opacity: 0.72,
  },
  surveyMarker: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    width: 4,
    marginLeft: -2,
    borderRadius: 2,
  },
  surveyLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: -spacing.sm,
  },
  alignRight: { textAlign: 'right' },
  forecastVerdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderLeftWidth: 4,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  forecastVerdictDanger: {
    borderLeftColor: colors.danger,
    backgroundColor: '#FDE8E5',
  },
  forecastVerdictWarning: {
    borderLeftColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  forecastVerdictSafe: {
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  verdictTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  forecastLedger: {
    borderTopWidth: 1,
    borderTopColor: '#B8C8C0',
  },
  methodText: {
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 15,
  },
  forecastEmpty: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#B8C8C0',
    paddingTop: spacing.md,
  },
  forecastEmptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  controlStrip: {
    backgroundColor: '#F7F4EC',
    borderColor: '#C8A96B',
    borderTopWidth: 5,
  },
  stripHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stripEyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  stripValue: {
    color: colors.primaryDark,
    fontSize: 31,
    fontWeight: '900',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  negative: { color: colors.danger },
  usageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: '#C8A96B',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  usageText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 18,
    borderRadius: 3,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  used: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  reserve: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#C8A96B',
    opacity: 0.65,
  },
  trackLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  legendText: { color: colors.textMuted, fontSize: 10, flex: 1 },
  ledger: { gap: 0, paddingVertical: spacing.sm },
  ledgerRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  ledgerRowStrong: {
    borderTopWidth: 2,
    borderTopColor: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.text,
  },
  ledgerLabel: { color: colors.textMuted, fontSize: 12, flex: 1 },
  ledgerLabelStrong: { color: colors.text, fontWeight: '900' },
  ledgerValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  ledgerValueStrong: { fontSize: 15, color: colors.primaryDark },
  warningValue: { color: colors.warning },
  actions: { flexDirection: 'row', gap: spacing.md },
  category: { gap: spacing.xs },
  categoryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  categoryName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  categoryAmount: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  categoryTrack: {
    height: 7,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    overflow: 'hidden',
  },
  categoryFill: { height: '100%', backgroundColor: colors.primary },
  disclaimer: { backgroundColor: colors.surfaceAlt },
  disclaimerText: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
});
