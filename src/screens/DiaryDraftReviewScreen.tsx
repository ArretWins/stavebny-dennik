import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Package,
  ReceiptText,
  ShieldAlert,
  Users,
} from 'lucide-react-native';
import {
  Card,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from '@/components/ui';
import {
  buildDailyDiaryDraft,
  type DailyDiaryDraftSourceKey,
} from '@/domain/dailyDiaryDraft';
import { localDateIso } from '@/domain/ids';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';
import { useApp } from '@/state/app';

const SOURCE_ICONS = {
  completedTasks: CheckCircle2,
  reviewTasks: ClipboardList,
  workers: Users,
  photos: Camera,
  materialRequests: Package,
  receipts: ReceiptText,
  blockedTasks: ShieldAlert,
} satisfies Record<
  DailyDiaryDraftSourceKey,
  React.ComponentType<{ color?: string; size?: number }>
>;

export function DiaryDraftReviewScreen({
  navigation,
}: {
  navigation: any;
}) {
  const { selectedProject, state } = useApp();
  const today = localDateIso();
  const draft = useMemo(
    () =>
      selectedProject
        ? buildDailyDiaryDraft(state, selectedProject.id, today)
        : undefined,
    [selectedProject?.id, state, today],
  );
  if (!selectedProject || !draft) return null;
  const activeSources = draft.sources.filter((source) => source.count > 0);

  return (
    <ScreenShell>
      <TopBar
        title={t('diaryDraft.title')}
        onBack={() => navigation.goBack()}
      />
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <ClipboardList color={colors.primaryDark} size={29} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>{t('diaryDraft.evidenceSheet')}</Text>
            <Text style={styles.heroTitle}>{selectedProject.name}</Text>
          </View>
          <View style={styles.countSeal}>
            <Text style={styles.count}>{draft.evidenceCount}</Text>
            <Text style={styles.countLabel}>{t('diaryDraft.sourcesShort')}</Text>
          </View>
        </View>
        <Text style={styles.heroHint}>{t('diaryDraft.heroHint')}</Text>
      </Card>

      {draft.needsWorkDescription ? (
        <Card style={styles.warningCard}>
          <ShieldAlert color={colors.warning} size={24} />
          <View style={styles.flex}>
            <Text style={styles.warningTitle}>
              {t('diaryDraft.workMissing')}
            </Text>
            <Text style={styles.warningText}>
              {t('diaryDraft.workMissingHint')}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>{t('diaryDraft.preview')}</Text>
        <View style={styles.previewBlock}>
          <Text style={styles.previewLabel}>{t('diary.workDone')}</Text>
          <Text
            style={[
              styles.previewText,
              !draft.workDescription && styles.placeholder,
            ]}
          >
            {draft.workDescription || t('diaryDraft.workPlaceholder')}
          </Text>
        </View>
        <View style={styles.previewBlock}>
          <Text style={styles.previewLabel}>{t('diary.workers')}</Text>
          <Text style={styles.previewText}>{draft.workerCount}</Text>
        </View>
        <View style={styles.previewBlock}>
          <Text style={styles.previewLabel}>{t('diary.note')}</Text>
          <Text style={[styles.previewText, !draft.note && styles.placeholder]}>
            {draft.note || t('diaryDraft.noNotes')}
          </Text>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>{t('diaryDraft.sourceLedger')}</Text>
        <Text style={styles.sectionHint}>{t('diaryDraft.sourceLedgerHint')}</Text>
        {activeSources.length ? (
          activeSources.map((source) => {
            const Icon = SOURCE_ICONS[source.key];
            return (
              <View key={source.key} style={styles.sourceRow}>
                <View style={styles.sourceIcon}>
                  <Icon color={colors.primary} size={20} />
                </View>
                <Text style={styles.sourceLabel}>
                  {t(`diaryDraft.sources.${source.key}`)}
                </Text>
                <Text style={styles.sourceCount}>{source.count}</Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptySources}>{t('diaryDraft.noSources')}</Text>
        )}
      </Card>

      <Card style={styles.integrityCard}>
        <Text style={styles.integrityTitle}>{t('diaryDraft.integrity')}</Text>
        <Text style={styles.integrityText}>
          {t('diaryDraft.integrityHint')}
        </Text>
      </Card>

      <PrimaryButton
        title={t('diaryDraft.review')}
        icon={ClipboardList}
        onPress={() =>
          navigation.navigate('Diary', {
            draft: {
              logDate: draft.logDate,
              workDescription: draft.workDescription,
              workerCount: draft.workerCount,
              note: draft.note,
            },
          })
        }
      />
      <SecondaryButton
        title={t('app.back')}
        onPress={() => navigation.goBack()}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    backgroundColor: '#F1F7EF',
    borderColor: '#A9CAA6',
    gap: spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#B9D2B6',
  },
  eyebrow: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
  },
  countSeal: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  count: {
    color: colors.primaryDark,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
  },
  countLabel: {
    color: colors.primaryDark,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroHint: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  warningCard: {
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
    backgroundColor: colors.warningSoft,
    alignItems: 'flex-start',
  },
  warningTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  warningText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  sectionHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  previewBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  previewLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  previewText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  placeholder: { color: colors.warning, fontStyle: 'italic' },
  sourceRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sourceIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  sourceCount: { color: colors.primaryDark, fontSize: 18, fontWeight: '900' },
  emptySources: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  integrityCard: {
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: '#FBFEFA',
  },
  integrityTitle: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '800',
  },
  integrityText: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
