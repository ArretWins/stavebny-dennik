import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, FileText, Share2 } from 'lucide-react-native';
import { Card, EmptyState, Field, PrimaryButton, ScreenShell, SecondaryButton, TextField, TopBar } from '@/components/ui';
import { formatEuroAmount } from '@/domain/receipts';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { generateLocalReceiptReport, generateRemoteReceiptReport, shareReceiptReport } from '@/services/receiptReports';
import { supabase } from '@/services/supabase';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

function monthStart(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`; }

export function ReceiptReportsScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, addReceiptExport, syncNow } = useApp();
  const [dateFrom, setDateFrom] = useState(monthStart()); const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [categoryIds, setCategoryIds] = useState<string[]>([]); const [excluded, setExcluded] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => state.receipts.filter(receipt => receipt.projectId === selectedProject?.id && receipt.status === 'ready' && !!receipt.purchaseDate && receipt.purchaseDate >= dateFrom && receipt.purchaseDate <= dateTo && (!categoryIds.length || !!receipt.categoryId && categoryIds.includes(receipt.categoryId))), [categoryIds, dateFrom, dateTo, selectedProject?.id, state.receipts]);
  const selected = candidates.filter(receipt => !excluded.includes(receipt.id)); const total = selected.reduce((sum, receipt) => sum + (receipt.totalAmountCents ?? 0), 0);
  const reports = state.receiptExports.filter(report => report.projectId === selectedProject?.id);
  if (!selectedProject) return <ScreenShell><TopBar title={t('receiptReports.title')} onBack={() => navigation.goBack()} /><EmptyState title={t('projects.noProjects')} /></ScreenShell>;
  const createReport = async () => {
    if (!selected.length) { Alert.alert(t('receiptReports.errors.empty')); return; }
    setBusy(true);
    try {
      let report;
      if (supabase) { await syncNow(); report = await generateRemoteReceiptReport({ projectId: selectedProject.id, dateFrom, dateTo, categoryIds, excludedReceiptIds: excluded }); }
      else { const version = Math.max(0, ...reports.filter(item => item.dateFrom === dateFrom && item.dateTo === dateTo).map(item => item.version)) + 1; report = await generateLocalReceiptReport({ ownerId: selectedProject.ownerId, project: selectedProject, dateFrom, dateTo, categoryIds, receipts: selected, categories: state.receiptCategories, files: state.receiptFiles, version }); }
      await addReceiptExport(report); Alert.alert(t('receiptReports.created'), t('receiptReports.createdHint', { count: report.pageCount }));
    } catch { Alert.alert(t('errors.generic')); } finally { setBusy(false); }
  };
  const toggleCategory = (id: string) => setCategoryIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const toggleReceipt = (id: string) => setExcluded(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  return <ScreenShell>
    <TopBar title={t('receiptReports.title')} onBack={() => navigation.goBack()} />
    <View style={styles.dateRow}><View style={styles.flex}><TextField label={t('receiptReports.from')} value={dateFrom} onChangeText={setDateFrom} placeholder={t('receipts.datePlaceholder')} /></View><View style={styles.flex}><TextField label={t('receiptReports.to')} value={dateTo} onChangeText={setDateTo} placeholder={t('receipts.datePlaceholder')} /></View></View>
    <Field label={t('receiptReports.categories')} hint={t('receiptReports.categoriesHint')}><View style={styles.categories}>{state.receiptCategories.map(category => <Pressable key={category.id} onPress={() => toggleCategory(category.id)} style={[styles.category, categoryIds.includes(category.id) && styles.categoryActive]}><Text style={[styles.categoryText, categoryIds.includes(category.id) && styles.categoryTextActive]}>{category.name}</Text></Pressable>)}</View></Field>
    <Card><View style={styles.totalRow}><View><Text style={styles.totalLabel}>{t('receiptReports.selected')}</Text><Text style={styles.total}>{formatEuroAmount(total)}</Text></View><Text style={styles.count}>{t('receiptReports.receiptCount', { count: selected.length })}</Text></View></Card>
    <Text style={styles.sectionTitle}>{t('receiptReports.documents')}</Text>
    {candidates.map(receipt => { const included = !excluded.includes(receipt.id); return <Pressable key={receipt.id} onPress={() => toggleReceipt(receipt.id)} style={[styles.receipt, included && styles.receiptIncluded]}><View style={[styles.checkbox, included && styles.checkboxActive]}>{included ? <Check color={colors.surface} size={16} /> : null}</View><View style={styles.flex}><Text style={styles.seller}>{receipt.seller}</Text><Text style={styles.meta}>{receipt.purchaseDate}</Text></View><Text style={styles.amount}>{formatEuroAmount(receipt.totalAmountCents)}</Text></Pressable>; })}
    {!candidates.length ? <EmptyState title={t('receiptReports.noReady')} hint={t('receiptReports.noReadyHint')} /> : null}
    <PrimaryButton title={busy ? t('app.loading') : t('receiptReports.create')} icon={FileText} disabled={busy || !selected.length} onPress={() => void createReport()} />
    <Text style={styles.sectionTitle}>{t('receiptReports.history')}</Text>
    {reports.map(report => <Card key={report.id}><View style={styles.totalRow}><View style={styles.flex}><Text style={styles.seller}>{t('receiptReports.version', { count: report.version })}</Text><Text style={styles.meta}>{report.dateFrom} – {report.dateTo} · {formatDateTime(report.createdAt)}</Text></View><Text style={styles.amount}>{formatEuroAmount(report.totalAmountCents)}</Text></View><SecondaryButton title={t('reports.share')} icon={Share2} onPress={() => void shareReceiptReport(report)} /></Card>)}
    {!reports.length ? <EmptyState title={t('receiptReports.noHistory')} /> : null}
  </ScreenShell>;
}

const styles = StyleSheet.create({ dateRow: { flexDirection: 'row', gap: spacing.sm }, flex: { flex: 1 }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, category: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface }, categoryActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, categoryText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' }, categoryTextActive: { color: colors.primaryDark }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, totalLabel: { color: colors.textMuted, fontSize: 11 }, total: { color: colors.primaryDark, fontSize: 25, fontWeight: '800' }, count: { color: colors.text, fontSize: 13, fontWeight: '700' }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, receipt: { minHeight: 62, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, receiptIncluded: { borderColor: '#B9D2B6' }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, checkboxActive: { borderColor: colors.primary, backgroundColor: colors.primary }, seller: { color: colors.text, fontSize: 14, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 11, marginTop: 2 }, amount: { color: colors.text, fontSize: 14, fontWeight: '800' } });
