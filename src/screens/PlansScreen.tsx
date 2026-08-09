import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ClipboardList, FileQuestion, FileUp, History, MapPinned } from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from '@/components/ui';
import { t } from '@/i18n';
import type { ProjectPlan } from '@/domain/types';
import { pickProjectPlan } from '@/services/planRepository';
import { useAuth } from '@/state/auth';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

export function PlansScreen({ navigation }: { navigation: any }) {
  const { userId } = useAuth();
  const {
    selectedProject,
    state,
    addProjectPlan,
    syncNow,
  } = useApp();
  const [busy, setBusy] = useState(false);
  const [expandedSeriesId, setExpandedSeriesId] = useState<string>();
  const plans = useMemo(
    () =>
      state.projectPlans.filter(
        plan => plan.projectId === selectedProject?.id,
      ),
    [selectedProject?.id, state.projectPlans],
  );
  const currentPlans = useMemo(
    () => plans.filter(plan => plan.isCurrent !== false),
    [plans],
  );

  const importPlan = async (previous?: ProjectPlan) => {
    if (!userId || !selectedProject) return;
    setBusy(true);
    try {
      const plan = await pickProjectPlan(
        userId,
        selectedProject.id,
        previous,
      );
      if (!plan) return;
      await addProjectPlan(plan);
      void syncNow().catch(() => undefined);
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'PLAN_FILE_TOO_LARGE'
          ? t('planning.tooLarge')
          : error instanceof Error && error.message === 'PLAN_FILE_UNSUPPORTED'
            ? t('planning.unsupported')
            : t('errors.generic');
      Alert.alert(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title={t('planning.title')} onBack={() => navigation.goBack()} />
      <Card style={styles.intro}>
        <View style={styles.introRow}>
          <View style={styles.icon}>
            <MapPinned color={colors.primary} size={28} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.heading}>{t('planning.plans')}</Text>
            <Text style={styles.hint}>{t('planning.hint')}</Text>
          </View>
        </View>
        <PrimaryButton
          title={t('planning.addPlan')}
          icon={FileUp}
          disabled={busy}
          onPress={() => void importPlan()}
        />
        <Text style={styles.importHint}>{t('planning.importHint')}</Text>
      </Card>
      <SecondaryButton
        title={t('siteTasks.all')}
        icon={ClipboardList}
        onPress={() => navigation.navigate('Tasks')}
      />
      <SecondaryButton
        title={t('siteTasks.defectsTitle')}
        icon={ClipboardList}
        onPress={() => navigation.navigate('Tasks', { kind: 'defect' })}
      />
      <SecondaryButton
        title={t('rfi.openRegister')}
        icon={FileQuestion}
        onPress={() => navigation.navigate('RfiList')}
      />
      {currentPlans.map(plan => {
        const count = state.siteTasks.filter(
          task => task.planId === plan.id,
        ).length;
        const versions = plans
          .filter(
            item =>
              (item.seriesId ?? item.id) === (plan.seriesId ?? plan.id),
          )
          .sort(
            (left, right) =>
              (right.versionNumber ?? 1) - (left.versionNumber ?? 1),
          );
        const seriesId = plan.seriesId ?? plan.id;
        const expanded = expandedSeriesId === seriesId;
        return (
          <Card key={plan.id} style={styles.planCard}>
            <View style={styles.planRow}>
              <View style={styles.document}>
                <Text style={styles.documentText}>
                  {plan.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.meta}>
                  {t('planning.version', {
                    version: plan.versionNumber ?? 1,
                  })}{' · '}
                  {t('planning.pages', { count: plan.pageCount })} ·{' '}
                  {t('planning.taskCount', { count })}
                </Text>
                <Text style={styles.sync}>
                  {plan.uploadStatus === 'synced'
                    ? t('planning.synced')
                    : t('dashboard.pendingTitle')}
                </Text>
              </View>
            </View>
            <PrimaryButton
              title={t('planning.openPlan')}
              onPress={() =>
                navigation.navigate('PlanBoard', { planId: plan.id })
              }
            />
            <View style={styles.versionActions}>
              <SecondaryButton
                title={t('planning.addVersion')}
                icon={FileUp}
                disabled={busy}
                style={styles.flex}
                onPress={() => void importPlan(plan)}
              />
              {versions.length > 1 ? (
                <SecondaryButton
                  title={t('planning.versionCount', {
                    count: versions.length,
                  })}
                  icon={History}
                  style={styles.flex}
                  onPress={() =>
                    setExpandedSeriesId(expanded ? undefined : seriesId)
                  }
                />
              ) : null}
            </View>
            {expanded
              ? versions.slice(1).map(version => (
                  <View key={version.id} style={styles.oldVersion}>
                    <View style={styles.flex}>
                      <Text style={styles.oldVersionTitle}>
                        {t('planning.version', {
                          version: version.versionNumber ?? 1,
                        })}
                      </Text>
                      <Text style={styles.meta}>
                        {t('planning.pages', { count: version.pageCount })}
                      </Text>
                    </View>
                    <SecondaryButton
                      title={t('planning.openPlan')}
                      onPress={() =>
                        navigation.navigate('PlanBoard', {
                          planId: version.id,
                        })
                      }
                    />
                  </View>
                ))
              : null}
          </Card>
        );
      })}
      {!currentPlans.length ? (
        <EmptyState
          title={t('planning.empty')}
          hint={t('planning.emptyHint')}
          action={
            <PrimaryButton
              title={t('planning.addPlan')}
              icon={FileUp}
              disabled={busy}
              onPress={() => void importPlan()}
            />
          }
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  intro: { borderTopWidth: 5, borderTopColor: colors.primary },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  flex: { flex: 1 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  importHint: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  planCard: { borderLeftWidth: 5, borderLeftColor: colors.warning },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  document: {
    width: 52,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  documentText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  planName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  sync: { color: colors.primary, fontSize: 10, fontWeight: '700', marginTop: 4 },
  versionActions: { flexDirection: 'row', gap: spacing.sm },
  oldVersion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  oldVersionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
