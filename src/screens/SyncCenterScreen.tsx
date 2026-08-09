import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BookOpenText,
  CheckCircle2,
  ClipboardList,
  FileText,
  HardHat,
  Hammer,
  Image,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  TopBar,
} from '@/components/ui';
import {
  activeSyncItems,
  syncErrorKind,
  syncItemCategory,
  type SyncItemCategory,
} from '@/domain/syncCenter';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

const icons = {
  diary: BookOpenText,
  photo: Image,
  receipt: ReceiptText,
  workforce: HardHat,
  procurement: PackageSearch,
  plan: FileText,
  tool: Hammer,
  task: ClipboardList,
  project: TriangleAlert,
  report: FileText,
} satisfies Record<SyncItemCategory, typeof BookOpenText>;

export function SyncCenterScreen({ navigation }: { navigation: any }) {
  const { state, syncNow } = useApp();
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => activeSyncItems(state.outbox), [state.outbox]);
  const failedCount = items.filter(item => item.status === 'failed').length;

  const retry = async () => {
    setBusy(true);
    try {
      await syncNow();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <TopBar title={t('syncCenter.title')} onBack={() => navigation.goBack()} />
      <Card style={failedCount ? styles.summaryFailed : styles.summary}>
        <View style={styles.summaryRow}>
          <View style={failedCount ? styles.failedIcon : styles.summaryIcon}>
            {failedCount ? (
              <TriangleAlert color={colors.danger} size={26} />
            ) : (
              <RefreshCw color={colors.primaryDark} size={26} />
            )}
          </View>
          <View style={styles.flex}>
            <Text style={styles.summaryTitle}>
              {failedCount
                ? t('syncCenter.failedTitle', { count: failedCount })
                : t('syncCenter.pendingTitle', { count: items.length })}
            </Text>
            <Text style={styles.hint}>{t('syncCenter.offlineHint')}</Text>
          </View>
        </View>
        {items.length ? (
          <PrimaryButton
            title={busy ? t('syncCenter.syncing') : t('syncCenter.retryAll')}
            icon={RefreshCw}
            disabled={busy}
            onPress={() => void retry()}
          />
        ) : null}
      </Card>

      {!items.length ? (
        <EmptyState
          title={t('syncCenter.allSynced')}
          hint={t('syncCenter.allSyncedHint')}
        />
      ) : (
        items.map(item => {
          const category = syncItemCategory(item.type);
          const Icon = icons[category];
          const failed = item.status === 'failed';
          return (
            <Card key={item.id} style={failed ? styles.itemFailed : styles.item}>
              <View style={styles.itemRow}>
                <View style={failed ? styles.failedIcon : styles.itemIcon}>
                  <Icon
                    color={failed ? colors.danger : colors.primaryDark}
                    size={22}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>
                    {t(`syncCenter.category.${category}`)}
                  </Text>
                  <Text style={styles.meta}>
                    {t(`syncCenter.status.${item.status}`)} ·{' '}
                    {t('syncCenter.attempts', { count: item.attemptCount })}
                  </Text>
                  <Text style={styles.meta}>{formatDateTime(item.updatedAt)}</Text>
                  {failed ? (
                    <Text style={styles.error}>
                      {t(`syncCenter.error.${syncErrorKind(item.lastError)}`)}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          );
        })
      )}
      {!items.length ? (
        <View style={styles.doneMark}>
          <CheckCircle2 color={colors.primary} size={22} />
          <Text style={styles.doneText}>{t('syncCenter.safeToClose')}</Text>
        </View>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { borderLeftWidth: 5, borderLeftColor: colors.primary },
  summaryFailed: {
    borderLeftWidth: 5,
    borderLeftColor: colors.danger,
    backgroundColor: '#FDECEC',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  item: { borderLeftWidth: 4, borderLeftColor: colors.warning },
  itemFailed: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  doneMark: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  doneText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
});
