import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CheckCircle2,
  ClipboardCheck,
  HardHat,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  TopBar,
} from '@/components/ui';
import {
  checklistSummary,
  checklistTemplates,
} from '@/domain/checklists';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

export function ChecklistsScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state } = useApp();
  const history = useMemo(
    () =>
      state.projectChecklists
        .filter(item => item.projectId === selectedProject?.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [selectedProject?.id, state.projectChecklists],
  );

  return (
    <ScreenShell>
      <TopBar
        title={t('checklists.title')}
        onBack={() => navigation.goBack()}
      />
      <Card style={styles.intro}>
        <View style={styles.row}>
          <View style={styles.heroIcon}>
            <ShieldCheck color={colors.primary} size={30} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.heading}>{t('checklists.introTitle')}</Text>
            <Text style={styles.meta}>{t('checklists.intro')}</Text>
          </View>
        </View>
      </Card>
      <PrimaryButton title={t('safetyBriefings.open')} icon={HardHat} onPress={() => navigation.navigate('SafetyBriefings')} />
      <PrimaryButton title="Udalosti a near miss" icon={ShieldAlert} onPress={() => navigation.navigate('SiteIncidents')} />

      <Text style={styles.section}>{t('checklists.templatesTitle')}</Text>
      {checklistTemplates.map(template => (
        <Pressable
          key={template.key}
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate('ChecklistEditor', {
              templateKey: template.key,
            })
          }
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Card
            style={{
              ...styles.template,
              borderLeftColor:
                template.category === 'safety'
                  ? colors.warning
                  : colors.primary,
            }}
          >
            <View style={styles.row}>
              {template.category === 'safety' ? (
                <HardHat color={colors.warning} size={26} />
              ) : (
                <ClipboardCheck color={colors.primary} size={26} />
              )}
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{t(template.titleKey)}</Text>
                <Text style={styles.meta}>{t(template.descriptionKey)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </Card>
        </Pressable>
      ))}

      <Text style={styles.section}>{t('checklists.history')}</Text>
      {history.length ? (
        history.map(checklist => {
          const summary = checklistSummary(checklist.answers);
          return (
            <Pressable
              key={checklist.id}
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('ChecklistEditor', {
                  checklistId: checklist.id,
                })
              }
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Card style={styles.historyCard}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>
                      {checklist.templateName}
                    </Text>
                    <Text style={styles.meta}>
                      {checklist.inspectionDate} ·{' '}
                      {t(`checklists.status.${checklist.status}`)}
                    </Text>
                  </View>
                  {checklist.status === 'completed' ? (
                    <CheckCircle2 color={colors.primary} size={24} />
                  ) : (
                    <ClipboardCheck color={colors.warning} size={24} />
                  )}
                </View>
                <Text
                  style={[
                    styles.summary,
                    summary.fail > 0 && styles.summaryFailed,
                  ]}
                >
                  {t('checklists.summary', summary)}
                </Text>
              </Card>
            </Pressable>
          );
        })
      ) : (
        <Card>
          <EmptyState
            title={t('checklists.empty')}
            hint={t('checklists.emptyHint')}
          />
        </Card>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  intro: { borderTopWidth: 4, borderTopColor: colors.primary },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  section: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  template: { borderLeftWidth: 5 },
  historyCard: { gap: spacing.sm },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  chevron: { color: colors.textMuted, fontSize: 30 },
  summary: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  summaryFailed: { color: colors.danger },
  pressed: { opacity: 0.75 },
});
