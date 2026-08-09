import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CalendarClock,
  CheckCircle2,
  FileQuestion,
  MapPin,
  Plus,
  UserRound,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  TopBar,
} from '@/components/ui';
import { isProjectRfiOverdue, projectRfiReference } from '@/domain/rfi';
import type { ProjectRfiStatus } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

type Tab = 'active' | 'closed' | 'all';

export function RfiListScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, refreshProjectData } = useApp();
  const [tab, setTab] = useState<Tab>('active');
  useEffect(() => { void refreshProjectData(); }, [refreshProjectData]);
  const projectRfis = useMemo(
    () => state.projectRfis.filter(rfi => rfi.projectId === selectedProject?.id),
    [selectedProject?.id, state.projectRfis],
  );
  const visible = projectRfis.filter(rfi =>
    tab === 'all' ? true : tab === 'closed' ? rfi.status === 'closed' : rfi.status !== 'closed',
  );
  const overdue = projectRfis.filter(rfi => isProjectRfiOverdue(rfi)).length;
  const open = projectRfis.filter(rfi => rfi.status === 'open').length;
  const answered = projectRfis.filter(rfi => rfi.status === 'answered').length;
  if (!selectedProject)
    return <ScreenShell><EmptyState title={t('projects.noProjects')} /></ScreenShell>;

  return (
    <ScreenShell>
      <TopBar title={t('rfi.title')} onBack={() => navigation.goBack()} />
      <Card style={styles.register}>
        <View style={styles.registerRow}>
          <View style={styles.registerIcon}>
            <FileQuestion color="#F2C14E" size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.kicker}>{t('rfi.registerKicker')}</Text>
            <Text style={styles.heading}>{t('rfi.registerTitle')}</Text>
            <Text style={styles.registerHint}>{t('rfi.registerHint')}</Text>
          </View>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricValue}>{open}</Text><Text style={styles.metricLabel}>{t('rfi.metricOpen')}</Text></View>
          <View style={styles.metric}><Text style={[styles.metricValue, overdue > 0 && styles.danger]}>{overdue}</Text><Text style={styles.metricLabel}>{t('rfi.metricOverdue')}</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{answered}</Text><Text style={styles.metricLabel}>{t('rfi.metricAnswered')}</Text></View>
        </View>
      </Card>
      <PrimaryButton title={t('rfi.create')} icon={Plus} onPress={() => navigation.navigate('RfiEditor', {})} />
      <View style={styles.tabs}>
        {(['active', 'closed', 'all'] as const).map(value => (
          <Pressable key={value} accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}>
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{t(`rfi.tabs.${value}`)}</Text>
          </Pressable>
        ))}
      </View>
      {visible.map(rfi => {
        const plan = state.projectPlans.find(item => item.id === rfi.planId);
        const overdueItem = isProjectRfiOverdue(rfi);
        return (
          <Pressable key={rfi.id} accessibilityRole="button" onPress={() => navigation.navigate('RfiEditor', { rfiId: rfi.id })}>
            <Card style={overdueItem ? styles.rfiOverdue : styles.rfiCard}>
              <View style={styles.cardTop}>
                <View style={styles.reference}><Text style={styles.referenceText}>{projectRfiReference(rfi.rfiNumber)}</Text></View>
                <View style={[
                  styles.status,
                  rfi.status === 'open' ? styles.statusOpen
                    : rfi.status === 'answered' ? styles.statusAnswered
                      : rfi.status === 'closed' ? styles.statusClosed
                        : styles.statusDraft,
                ]}>
                  <Text style={styles.statusText}>{t(`rfi.status.${rfi.status}`)}</Text>
                </View>
              </View>
              <Text style={styles.subject}>{rfi.subject}</Text>
              <View style={styles.metaRow}><UserRound color={colors.textMuted} size={15} /><Text style={styles.meta}>{rfi.recipientName}</Text></View>
              {rfi.dueDate ? <View style={styles.metaRow}><CalendarClock color={overdueItem ? colors.danger : colors.textMuted} size={15} /><Text style={[styles.meta, overdueItem && styles.danger]}>{overdueItem ? t('rfi.overdueDate', { date: formatDate(rfi.dueDate) }) : t('rfi.dueDate', { date: formatDate(rfi.dueDate) })}</Text></View> : null}
              {plan ? <View style={styles.metaRow}><MapPin color={colors.primary} size={15} /><Text style={styles.meta}>{t('rfi.planRevision', { name: plan.name, version: plan.versionNumber, page: rfi.pageNumber ?? 1 })}</Text></View> : null}
              {rfi.status === 'answered' ? <View style={styles.answerFlag}><CheckCircle2 color={colors.primaryDark} size={16} /><Text style={styles.answerFlagText}>{t('rfi.answerReady')}</Text></View> : null}
            </Card>
          </Pressable>
        );
      })}
      {!visible.length ? <EmptyState title={t('rfi.empty')} hint={t('rfi.emptyHint')} /> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  register: { backgroundColor: '#133B5C', borderTopWidth: 6, borderTopColor: '#F2C14E' },
  registerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  registerIcon: { width: 58, height: 58, borderRadius: radius.md, backgroundColor: '#214F70', alignItems: 'center', justifyContent: 'center' },
  kicker: { color: '#F2C14E', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  heading: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  registerHint: { color: '#D5E2EA', fontSize: 12, lineHeight: 18 },
  metrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#315C78', paddingTop: spacing.md },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', fontVariant: ['tabular-nums'] },
  metricLabel: { color: '#BCD0DC', fontSize: 10, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: spacing.xs, padding: 4, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.primaryDark },
  rfiCard: { borderLeftWidth: 5, borderLeftColor: '#2B6F95' },
  rfiOverdue: { borderLeftWidth: 5, borderLeftColor: colors.danger, backgroundColor: '#FFF8F6' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reference: { backgroundColor: '#133B5C', paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm },
  referenceText: { color: '#FFFFFF', fontFamily: 'monospace', fontSize: 12, fontWeight: '900' },
  status: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  statusDraft: { backgroundColor: colors.surfaceAlt },
  statusOpen: { backgroundColor: colors.warningSoft },
  statusAnswered: { backgroundColor: colors.primarySoft },
  statusClosed: { backgroundColor: '#E7EDF0' },
  statusText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  subject: { color: colors.text, fontSize: 17, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  danger: { color: colors.danger },
  answerFlag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  answerFlagText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
});
