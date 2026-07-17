import React, { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { FileText, Link2, ReceiptText, Unlink } from 'lucide-react-native';
import { Card, EmptyState, PrimaryButton, ScreenShell, SecondaryButton, TextField, TopBar } from '@/components/ui';
import { formatEuroAmount, parseEuroAmount } from '@/domain/receipts';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

export function RequestReceiptLinkScreen({ navigation, route }: { navigation: any; route: { params: { requestId: string } } }) {
  const { selectedProject, state, linkReceiptRequest, unlinkReceiptRequest } = useApp();
  const request = state.materialRequests.find(item => item.id === route.params.requestId);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(state.receiptRequestLinks.filter(link => link.requestId === route.params.requestId).map(link => [link.receiptId, link.allocatedAmountCents === undefined ? '' : (link.allocatedAmountCents / 100).toFixed(2).replace('.', ',')])));
  const [busyId, setBusyId] = useState<string>();
  const receipts = useMemo(() => state.receipts.filter(receipt => receipt.projectId === selectedProject?.id && (receipt.status === 'ready' || state.receiptRequestLinks.some(link => link.requestId === request?.id && link.receiptId === receipt.id))), [request?.id, selectedProject?.id, state.receiptRequestLinks, state.receipts]);
  if (!selectedProject || !request) return <ScreenShell><TopBar title={t('receiptLinks.title')} onBack={() => navigation.goBack()} /><EmptyState title={t('receiptLinks.requestMissing')} /></ScreenShell>;
  const saveLink = async (receiptId: string, availableCents: number) => {
    const raw = amounts[receiptId]?.trim() ?? ''; const allocated = raw ? parseEuroAmount(raw) : undefined;
    if (raw && allocated === undefined) { Alert.alert(t('receipts.errors.invalidAmount')); return; }
    if (allocated !== undefined && allocated > availableCents) { Alert.alert(t('receiptLinks.allocationExceeded'), t('receiptLinks.available', { amount: formatEuroAmount(availableCents) })); return; }
    setBusyId(receiptId); try { await linkReceiptRequest(receiptId, request.id, allocated); } catch { Alert.alert(t('errors.generic')); } finally { setBusyId(undefined); }
  };
  const removeLink = async (receiptId: string) => { setBusyId(receiptId); try { await unlinkReceiptRequest(receiptId, request.id); } catch { Alert.alert(t('errors.generic')); } finally { setBusyId(undefined); } };
  const items = state.materialRequestItems.filter(item => item.requestId === request.id);
  return <ScreenShell>
    <TopBar title={t('receiptLinks.title')} onBack={() => navigation.goBack()} />
    <Card style={styles.requestCard}><View style={styles.row}><Link2 color={colors.primary} size={28} /><View style={styles.flex}><Text style={styles.heading}>{t('receiptLinks.request')}</Text><Text style={styles.meta}>{items.map(item => `${item.name} · ${item.quantity} ${item.unit}`).join('\n')}</Text></View></View></Card>
    <Text style={styles.sectionTitle}>{t('receiptLinks.receipts')}</Text><Text style={styles.hint}>{t('receiptLinks.hint')}</Text>
    {receipts.map(receipt => {
      const currentLink = state.receiptRequestLinks.find(link => link.requestId === request.id && link.receiptId === receipt.id);
      const allocatedElsewhere = state.receiptRequestLinks.filter(link => link.receiptId === receipt.id && link.requestId !== request.id).reduce((sum, link) => sum + (link.allocatedAmountCents ?? 0), 0);
      const available = Math.max(0, (receipt.totalAmountCents ?? 0) - allocatedElsewhere); const firstFile = state.receiptFiles.filter(file => file.receiptId === receipt.id).sort((a, b) => a.pageOrder - b.pageOrder)[0];
      return <Card key={receipt.id} style={styles.receiptCard}>
        <View style={styles.row}><View style={styles.preview}>{firstFile?.mimeType.startsWith('image/') ? <Image source={{ uri: firstFile.localUri }} style={styles.image} /> : <FileText color={colors.danger} size={25} />}</View><View style={styles.flex}><Text style={styles.heading}>{receipt.seller}</Text><Text style={styles.meta}>{receipt.purchaseDate} · {formatEuroAmount(receipt.totalAmountCents)}</Text><Text style={styles.available}>{t('receiptLinks.available', { amount: formatEuroAmount(available) })}</Text></View>{currentLink ? <View style={styles.linked}><Text style={styles.linkedText}>{t('receiptLinks.linked')}</Text></View> : null}</View>
        <TextField label={t('receiptLinks.allocated')} value={amounts[receipt.id] ?? ''} onChangeText={value => setAmounts(current => ({ ...current, [receipt.id]: value }))} keyboardType="decimal-pad" placeholder={t('receiptLinks.optionalAmount')} />
        <PrimaryButton title={currentLink ? t('receiptLinks.update') : t('receiptLinks.link')} icon={ReceiptText} disabled={busyId === receipt.id} onPress={() => void saveLink(receipt.id, available)} />
        {currentLink ? <SecondaryButton title={t('receiptLinks.unlink')} icon={Unlink} disabled={busyId === receipt.id} onPress={() => void removeLink(receipt.id)} /> : null}
      </Card>;
    })}
    {!receipts.length ? <EmptyState title={t('receiptLinks.noReceipts')} hint={t('receiptLinks.noReceiptsHint')} action={<PrimaryButton title={t('receipts.add')} icon={ReceiptText} onPress={() => navigation.navigate('ReceiptEditor')} />} /> : null}
  </ScreenShell>;
}

const styles = StyleSheet.create({ requestCard: { borderLeftWidth: 6, borderLeftColor: colors.primary }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, flex: { flex: 1 }, heading: { color: colors.text, fontSize: 15, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, receiptCard: { gap: spacing.md }, preview: { width: 54, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, image: { width: '100%', height: '100%', resizeMode: 'cover' }, available: { color: colors.primaryDark, fontSize: 11, fontWeight: '700', marginTop: 3 }, linked: { borderRadius: radius.sm, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 5 }, linkedText: { color: colors.primaryDark, fontSize: 10, fontWeight: '800' } });
