import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, Plus, ReceiptText, ScanLine } from 'lucide-react-native';
import { Card, EmptyState, PrimaryButton, ScreenShell, SecondaryButton, TopBar } from '@/components/ui';
import { formatEuroAmount } from '@/domain/receipts';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, radius, spacing, typeScale } from '@/theme/tokens';

type Filter = 'all' | 'ready' | 'review';

export function ReceiptsScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const projectReceipts = useMemo(() => state.receipts.filter(receipt => receipt.projectId === selectedProject?.id), [selectedProject?.id, state.receipts]);
  const visibleReceipts = useMemo(() => projectReceipts.filter(receipt => filter === 'all' || (filter === 'ready' ? receipt.status === 'ready' : receipt.status !== 'ready')), [filter, projectReceipts]);
  const ready = projectReceipts.filter(receipt => receipt.status === 'ready');
  const total = ready.reduce((sum, receipt) => sum + (receipt.totalAmountCents ?? 0), 0);

  if (!selectedProject) return <ScreenShell><TopBar title={t('receipts.title')} onBack={() => navigation.goBack()} /><EmptyState title={t('projects.noProjects')} /></ScreenShell>;
  return <ScreenShell>
    <TopBar title={t('receipts.title')} onBack={() => navigation.goBack()} />
    <View style={styles.summary}>
      <View><Text style={styles.summaryLabel}>{t('receipts.readyTotal')}</Text><Text style={styles.summaryAmount}>{formatEuroAmount(total)}</Text><Text style={styles.summaryMeta}>{selectedProject.name}</Text></View>
      <View style={styles.scanBadge}><ScanLine color={colors.primary} size={25} /><Text style={styles.scanCount}>{projectReceipts.length - ready.length}</Text><Text style={styles.scanLabel}>{t('receipts.toReview')}</Text></View>
    </View>
    <PrimaryButton title={t('receipts.add')} icon={Plus} onPress={() => navigation.navigate('ReceiptEditor')} />
    <SecondaryButton title={t('receiptReports.open')} icon={FileText} onPress={() => navigation.navigate('ReceiptReports')} />
    <View style={styles.filters}>{(['all', 'ready', 'review'] as const).map(item => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{t(`receipts.filter.${item}`)}</Text></Pressable>)}</View>
    {visibleReceipts.length ? visibleReceipts.map(receipt => {
      const files = state.receiptFiles.filter(file => file.receiptId === receipt.id).sort((a, b) => a.pageOrder - b.pageOrder);
      const first = files[0];
      const category = state.receiptCategories.find(item => item.id === receipt.categoryId);
      return <Pressable key={receipt.id} onPress={() => navigation.navigate('ReceiptEditor', { receiptId: receipt.id })}>
        <Card style={styles.receiptCard}>
          <View style={styles.documentEdge}>{first?.mimeType.startsWith('image/') ? <Image source={{ uri: first.localUri }} style={styles.thumbnail} /> : <FileText color={colors.danger} size={28} />}</View>
          <View style={styles.receiptBody}><Text style={styles.seller} numberOfLines={1}>{receipt.seller || t('receipts.unknownSeller')}</Text><Text style={styles.meta}>{receipt.purchaseDate || t('receipts.datePending')}{category ? ` · ${category.name}` : ''}</Text><Text style={styles.meta}>{t('receipts.pageCount', { count: files.length })}</Text></View>
          <View style={styles.amountColumn}><Text style={styles.amount}>{receipt.totalAmountCents === undefined ? '—' : formatEuroAmount(receipt.totalAmountCents)}</Text><View style={[styles.status, receipt.status === 'ready' ? styles.statusReady : styles.statusReview]}><Text style={[styles.statusText, receipt.status === 'ready' ? styles.statusTextReady : styles.statusTextReview]}>{t(receipt.status === 'ready' ? 'receipts.status.ready' : 'receipts.status.review')}</Text></View></View>
        </Card>
      </Pressable>;
    }) : <Card><EmptyState title={t(filter === 'all' ? 'receipts.empty' : 'receipts.emptyFilter')} hint={t('receipts.emptyHint')} action={<PrimaryButton title={t('receipts.add')} icon={ReceiptText} onPress={() => navigation.navigate('ReceiptEditor')} />} /></Card>}
  </ScreenShell>;
}

const styles = StyleSheet.create({
  summary: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { ...typeScale.meta, color: '#DCEEDB' }, summaryAmount: { fontSize: 31, lineHeight: 38, fontWeight: '800', color: colors.surface, marginTop: 2 }, summaryMeta: { color: '#DCEEDB', fontSize: 12, marginTop: 2 },
  scanBadge: { minWidth: 80, minHeight: 80, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: spacing.sm }, scanCount: { color: colors.text, fontSize: 18, fontWeight: '800' }, scanLabel: { color: colors.textMuted, fontSize: 10 },
  filters: { flexDirection: 'row', gap: spacing.sm }, filter: { flex: 1, minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }, filterActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, filterTextActive: { color: colors.primaryDark },
  receiptCard: { flexDirection: 'row', padding: 0, overflow: 'hidden', alignItems: 'stretch', gap: 0 }, documentEdge: { width: 74, minHeight: 96, backgroundColor: '#F1EEE7', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.border }, thumbnail: { width: '100%', height: '100%', resizeMode: 'cover' }, receiptBody: { flex: 1, padding: spacing.md, justifyContent: 'center', gap: 4 }, seller: { color: colors.text, fontSize: 15, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 11, lineHeight: 15 }, amountColumn: { padding: spacing.md, paddingLeft: 0, alignItems: 'flex-end', justifyContent: 'space-between' }, amount: { color: colors.text, fontSize: 15, fontWeight: '800' }, status: { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 4 }, statusReady: { backgroundColor: colors.primarySoft }, statusReview: { backgroundColor: colors.warningSoft }, statusText: { fontSize: 10, fontWeight: '800' }, statusTextReady: { color: colors.primaryDark }, statusTextReview: { color: colors.warning },
});
