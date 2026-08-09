import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  BadgeEuro,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  ReceiptText,
  Store,
  Share2,
  Trash2,
  Truck,
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
  WarningActionButton,
} from '@/components/ui';
import {
  summarizeProcurement,
  validateSupplierQuote,
} from '@/domain/procurement';
import type { MaterialSupplierQuote } from '@/domain/types';
import {
  formatEuroAmount,
  parseEuroAmount,
} from '@/domain/receipts';
import { formatDate, formatDateTime } from '@/i18n/format';
import { t } from '@/i18n';
import {
  createSupplierQuoteInvite,
  revokeSupplierQuoteInvite,
  type CreatedSupplierQuoteInvite,
} from '@/services/procurementRepository';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

type QuoteForm = {
  id?: string;
  supplierName: string;
  total: string;
  deliveryDate: string;
  validUntil: string;
  note: string;
};

const EMPTY_FORM: QuoteForm = {
  supplierName: '',
  total: '',
  deliveryDate: '',
  validUntil: '',
  note: '',
};

function quoteForm(quote: MaterialSupplierQuote): QuoteForm {
  return {
    id: quote.id,
    supplierName: quote.supplierName,
    total: (quote.totalAmountCents / 100).toFixed(2).replace('.', ','),
    deliveryDate: quote.deliveryDate ?? '',
    validUntil: quote.validUntil ?? '',
    note: quote.note ?? '',
  };
}

export function MaterialProcurementScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params: { requestId: string } };
}) {
  const {
    state,
    saveSupplierQuote,
    selectSupplierQuote,
    withdrawSupplierQuote,
    syncNow,
    refreshProjectData,
  } = useApp();
  const request = state.materialRequests.find(
    item => item.id === route.params.requestId,
  );
  const items = state.materialRequestItems.filter(
    item => item.requestId === request?.id,
  );
  const quotes = (state.materialSupplierQuotes ?? []).filter(
    item => item.requestId === request?.id,
  );
  const receiptLinks = state.receiptRequestLinks.filter(
    item => item.requestId === request?.id,
  );
  const summary = request
    ? summarizeProcurement({ request, quotes, receiptLinks })
    : undefined;
  const [form, setForm] = useState<QuoteForm>();
  const [busyId, setBusyId] = useState<string>();
  const [invite, setInvite] = useState<CreatedSupplierQuoteInvite>();
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!request || !summary)
    return (
      <ScreenShell>
        <TopBar
          title={t('procurement.title')}
          onBack={() => navigation.goBack()}
        />
        <EmptyState title={t('receiptLinks.requestMissing')} />
      </ScreenShell>
    );

  const canManage =
    request.status === 'approved' || request.status === 'partially_purchased';
  const withdrawn = quotes.filter(quote => quote.status === 'withdrawn');

  const createInvite = async () => {
    setInviteBusy(true);
    try {
      setInvite(await createSupplierQuoteInvite(request.id, 72));
      setCopied(false);
    } catch {
      Alert.alert(
        t('procurement.linkRequiredServer'),
        t('procurement.linkRequiredServerHint'),
      );
    } finally {
      setInviteBusy(false);
    }
  };

  const revokeInvite = () => {
    if (!invite) return;
    Alert.alert(
      t('procurement.revokeLinkTitle'),
      t('procurement.revokeLinkHint'),
      [
        { text: t('app.cancel'), style: 'cancel' },
        {
          text: t('procurement.revokeLink'),
          style: 'destructive',
          onPress: () => {
            setInviteBusy(true);
            void revokeSupplierQuoteInvite(invite.id)
              .then(() => {
                setInvite(undefined);
                Alert.alert(t('procurement.linkRevoked'));
              })
              .catch(() => Alert.alert(t('errors.generic')))
              .finally(() => setInviteBusy(false));
          },
        },
      ],
    );
  };

  const save = async () => {
    if (!form) return;
    const totalAmountCents = parseEuroAmount(form.total);
    const validation = validateSupplierQuote({
      supplierName: form.supplierName,
      totalAmountCents,
      deliveryDate: form.deliveryDate || undefined,
      validUntil: form.validUntil || undefined,
      note: form.note,
    });
    if (validation !== 'ok') {
      Alert.alert(
        t(
          validation === 'supplier'
            ? 'procurement.invalidSupplier'
            : validation === 'amount'
              ? 'procurement.invalidAmount'
              : validation === 'delivery_date'
                ? 'procurement.invalidDelivery'
                : validation === 'valid_until'
                  ? 'procurement.invalidValidity'
                  : 'procurement.invalidNote',
        ),
      );
      return;
    }
    if (totalAmountCents === undefined) return;
    setBusyId(form.id ?? 'new');
    try {
      await saveSupplierQuote({
        id: form.id,
        requestId: request.id,
        supplierName: form.supplierName,
        totalAmountCents,
        deliveryDate: form.deliveryDate || undefined,
        validUntil: form.validUntil || undefined,
        note: form.note,
      });
      setForm(undefined);
      void syncNow().catch(() => undefined);
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusyId(undefined);
    }
  };

  const confirmSelection = (quote: MaterialSupplierQuote) => {
    Alert.alert(
      t('procurement.selectTitle'),
      t('procurement.selectHint', {
        amount: formatEuroAmount(quote.totalAmountCents),
      }),
      [
        { text: t('app.cancel'), style: 'cancel' },
        {
          text: t('procurement.confirmSelect'),
          onPress: () => {
            setBusyId(quote.id);
            void selectSupplierQuote(quote.id)
              .then(() => syncNow())
              .catch(() => Alert.alert(t('errors.generic')))
              .finally(() => setBusyId(undefined));
          },
        },
      ],
    );
  };

  const confirmWithdrawal = (quote: MaterialSupplierQuote) => {
    Alert.alert(
      t('procurement.withdrawTitle'),
      t('procurement.withdrawHint'),
      [
        { text: t('app.cancel'), style: 'cancel' },
        {
          text: t('procurement.confirmWithdraw'),
          style: 'destructive',
          onPress: () => {
            setBusyId(quote.id);
            void withdrawSupplierQuote(quote.id)
              .then(() => syncNow())
              .catch(() => Alert.alert(t('errors.generic')))
              .finally(() => setBusyId(undefined));
          },
        },
      ],
    );
  };

  return (
    <ScreenShell>
      <TopBar
        title={t('procurement.title')}
        onBack={() => navigation.goBack()}
      />
      <Card style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetIcon}>
            <ClipboardList color={colors.primaryDark} size={28} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>
              {t('procurement.comparisonSheet')}
            </Text>
            <Text style={styles.sheetTitle}>
              {t(`procurement.stage.${summary.stage}`)}
            </Text>
          </View>
        </View>
        <Text style={styles.label}>{t('procurement.requestItems')}</Text>
        {items.map(item => (
          <View style={styles.itemRow} key={item.id}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemAmount}>
              {item.quantity} {item.unit}
            </Text>
          </View>
        ))}
      </Card>

      <View style={styles.metrics}>
        <Card style={styles.metric}>
          <BadgeEuro color={colors.primaryDark} size={23} />
          <Text style={styles.metricLabel}>{t('procurement.commitment')}</Text>
          <Text style={styles.metricValue}>
            {formatEuroAmount(summary.remainingCommitmentCents)}
          </Text>
        </Card>
        <Card style={styles.metric}>
          <ReceiptText color={colors.primaryDark} size={23} />
          <Text style={styles.metricLabel}>{t('procurement.documented')}</Text>
          <Text style={styles.metricValue}>
            {formatEuroAmount(summary.allocatedReceiptCents)}
          </Text>
        </Card>
      </View>

      {summary.selectedQuote ? (
        <Card style={styles.selectionCard}>
          <View style={styles.row}>
            <View style={styles.selectedSeal}>
              <Check color={colors.surface} size={24} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>
                {t('procurement.selectedSupplier')}
              </Text>
              <Text style={styles.selectedName}>
                {summary.selectedQuote.supplierName}
              </Text>
              <Text style={styles.selectedAmount}>
                {formatEuroAmount(summary.selectedQuote.totalAmountCents)}
              </Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(
                    summary.documentedRatio * 100,
                  )}%` as `${number}%`,
                },
              ]}
            />
          </View>
          {summary.savingsVsHighestCents > 0 ? (
            <Text style={styles.savings}>
              {t('procurement.savings', {
                amount: formatEuroAmount(summary.savingsVsHighestCents),
              })}
            </Text>
          ) : null}
          <Text style={styles.lockedHint}>{t('procurement.lockedHint')}</Text>
          <SecondaryButton
            title={t('procurement.linkReceipt')}
            icon={ReceiptText}
            onPress={() =>
              navigation.navigate('RequestReceiptLink', {
                requestId: request.id,
              })
            }
          />
          <PrimaryButton title={t('materialDeliveries.openForRequest')} icon={Truck} onPress={() => navigation.navigate('MaterialDeliveries', { requestId: request.id })} />
        </Card>
      ) : null}

      {canManage && !summary.selectedQuote ? (
        <Card style={styles.rfqCard}>
          <View style={styles.row}>
            <View style={styles.rfqIcon}>
              <QrCode color="#E8B84A" size={29} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.rfqEyebrow}>
                {t('procurement.requestOffersEyebrow')}
              </Text>
              <Text style={styles.rfqTitle}>
                {t('procurement.requestOffers')}
              </Text>
              <Text style={styles.rfqHint}>
                {t('procurement.requestOffersHint')}
              </Text>
            </View>
          </View>
          {invite ? (
            <>
              <View style={styles.qrFrame}>
                <QRCode
                  value={invite.url}
                  size={184}
                  color="#132C36"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text style={styles.rfqExpiry}>
                {t('procurement.linkExpires', {
                  date: formatDateTime(invite.expiresAt),
                })}
              </Text>
              <Text selectable numberOfLines={2} style={styles.linkText}>
                {invite.url}
              </Text>
              <View style={styles.quoteActions}>
                <SecondaryButton
                  title={copied ? t('procurement.linkCopied') : t('procurement.copyLink')}
                  icon={Copy}
                  style={styles.flex}
                  onPress={() => {
                    void Clipboard.setStringAsync(invite.url).then(() =>
                      setCopied(true),
                    );
                  }}
                />
                <SecondaryButton
                  title={t('procurement.shareLink')}
                  icon={Share2}
                  style={styles.flex}
                  onPress={() => void Share.share({ message: invite.url })}
                />
              </View>
              <SecondaryButton
                title={t('procurement.refreshOffers')}
                icon={RefreshCw}
                disabled={inviteBusy}
                onPress={() => {
                  setInviteBusy(true);
                  void refreshProjectData()
                    .catch(() => Alert.alert(t('errors.generic')))
                    .finally(() => setInviteBusy(false));
                }}
              />
              <WarningActionButton
                title={t('procurement.revokeLink')}
                disabled={inviteBusy}
                onPress={revokeInvite}
              />
            </>
          ) : (
            <PrimaryButton
              title={t('procurement.createSupplierLink')}
              icon={QrCode}
              disabled={inviteBusy}
              onPress={() => void createInvite()}
            />
          )}
        </Card>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('procurement.offers')}</Text>
        {canManage && !form ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('procurement.addOffer')}
            style={styles.addButton}
            onPress={() => setForm({ ...EMPTY_FORM })}
          >
            <Plus color={colors.surface} size={20} />
          </Pressable>
        ) : null}
      </View>

      {form ? (
        <Card style={styles.formCard}>
          <Text style={styles.sectionTitle}>
            {t(form.id ? 'procurement.editOffer' : 'procurement.addOffer')}
          </Text>
          <TextField
            label={t('procurement.supplier')}
            value={form.supplierName}
            onChangeText={supplierName =>
              setForm(current => current && { ...current, supplierName })
            }
            placeholder={t('procurement.supplierPlaceholder')}
          />
          <TextField
            label={t('procurement.total')}
            value={form.total}
            onChangeText={total =>
              setForm(current => current && { ...current, total })
            }
            keyboardType="decimal-pad"
            placeholder={t('procurement.totalPlaceholder')}
          />
          <View style={styles.dateFields}>
            <TextField
              label={t('procurement.deliveryDate')}
              value={form.deliveryDate}
              onChangeText={deliveryDate =>
                setForm(current => current && { ...current, deliveryDate })
              }
              placeholder={t('procurement.deliveryPlaceholder')}
              style={styles.flex}
            />
            <TextField
              label={t('procurement.validUntil')}
              value={form.validUntil}
              onChangeText={validUntil =>
                setForm(current => current && { ...current, validUntil })
              }
              placeholder={t('procurement.deliveryPlaceholder')}
              style={styles.flex}
            />
          </View>
          <TextArea
            label={t('procurement.note')}
            value={form.note}
            onChangeText={note =>
              setForm(current => current && { ...current, note })
            }
            maxLength={500}
            placeholder={t('procurement.notePlaceholder')}
          />
          <PrimaryButton
            title={t('procurement.saveOffer')}
            icon={Check}
            disabled={busyId === (form.id ?? 'new')}
            onPress={() => void save()}
          />
          <SecondaryButton
            title={t('procurement.cancelEdit')}
            onPress={() => setForm(undefined)}
          />
        </Card>
      ) : null}

      {summary.comparisons.map((comparison, index) => {
        const quote = comparison.quote;
        return (
          <Card
            key={quote.id}
            style={{
              ...styles.quoteCard,
              ...(comparison.isSelected ? styles.quoteSelected : {}),
            }}
          >
            <View style={styles.quoteHead}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.quoteName}>{quote.supplierName}</Text>
                <View style={styles.quoteMeta}>
                  {quote.deliveryDate ? (
                    <>
                      <Truck color={colors.textMuted} size={15} />
                      <Text style={styles.meta}>
                        {formatDate(quote.deliveryDate)}
                      </Text>
                    </>
                  ) : null}
                  {quote.validUntil ? (
                    <>
                      <CalendarDays color={colors.textMuted} size={15} />
                      <Text style={styles.meta}>
                        {formatDate(quote.validUntil)}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
              <Text style={styles.quoteAmount}>
                {formatEuroAmount(quote.totalAmountCents)}
              </Text>
            </View>
            {comparison.isCheapest ? (
              <View style={styles.cheapestBadge}>
                <Text style={styles.cheapestText}>
                  {t('procurement.cheapest')}
                </Text>
              </View>
            ) : (
              <Text style={styles.difference}>
                {t('procurement.difference', {
                  amount: formatEuroAmount(
                    comparison.differenceFromCheapestCents,
                  ),
                })}
              </Text>
            )}
            {quote.note ? <Text style={styles.note}>{quote.note}</Text> : null}
            {canManage && !comparison.isSelected ? (
              <>
                <PrimaryButton
                  title={t('procurement.select')}
                  icon={Store}
                  disabled={busyId === quote.id}
                  onPress={() => confirmSelection(quote)}
                />
                <View style={styles.quoteActions}>
                  <SecondaryButton
                    title={t('procurement.editOffer')}
                    icon={Pencil}
                    style={styles.flex}
                    onPress={() => setForm(quoteForm(quote))}
                  />
                  <WarningActionButton
                    title={t('procurement.withdraw')}
                    icon={Trash2}
                    style={styles.flex}
                    disabled={busyId === quote.id}
                    onPress={() => confirmWithdrawal(quote)}
                  />
                </View>
              </>
            ) : null}
          </Card>
        );
      })}
      {!summary.comparisons.length && !form ? (
        <EmptyState
          title={t('procurement.empty')}
          hint={t('procurement.emptyHint')}
          action={
            canManage ? (
              <PrimaryButton
                title={t('procurement.addOffer')}
                icon={Plus}
                onPress={() => setForm({ ...EMPTY_FORM })}
              />
            ) : undefined
          }
        />
      ) : null}
      {withdrawn.length ? (
        <Card style={styles.withdrawnCard}>
          <Text style={styles.meta}>
            {t('procurement.withdrawnCount', { count: withdrawn.length })}
          </Text>
          {withdrawn.map(quote => (
            <Text key={quote.id} style={styles.withdrawnText}>
              {quote.supplierName} · {formatEuroAmount(quote.totalAmountCents)}
            </Text>
          ))}
        </Card>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    borderTopWidth: 6,
    borderTopColor: '#C8A96B',
    backgroundColor: '#F8F5EC',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: '#EEE3C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sheetTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  itemRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#D9CEB7',
  },
  itemName: { flex: 1, color: colors.text, fontSize: 13 },
  itemAmount: { color: colors.text, fontSize: 13, fontWeight: '900' },
  metrics: { flexDirection: 'row', gap: spacing.md },
  metric: { flex: 1, gap: spacing.xs },
  metricLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  metricValue: {
    color: colors.primaryDark,
    fontSize: 19,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  selectionCard: {
    borderLeftWidth: 6,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  rfqCard: {
    backgroundColor: '#132C36',
    borderColor: '#264955',
    borderTopWidth: 5,
    borderTopColor: '#E8B84A',
  },
  rfqIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: '#203E49',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rfqEyebrow: {
    color: '#E8B84A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  rfqTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  rfqHint: { color: '#B9C8CD', fontSize: 12, lineHeight: 18 },
  qrFrame: {
    alignSelf: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#E8B84A',
  },
  rfqExpiry: {
    color: '#E8B84A',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  linkText: {
    color: '#D8E3E6',
    fontSize: 10,
    lineHeight: 15,
    fontFamily: 'monospace',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selectedSeal: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedName: { color: colors.text, fontSize: 18, fontWeight: '900' },
  selectedAmount: {
    color: colors.primaryDark,
    fontSize: 24,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  savings: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  lockedHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCard: { borderTopWidth: 5, borderTopColor: colors.primary },
  dateFields: { flexDirection: 'row', gap: spacing.md },
  quoteCard: { borderLeftWidth: 5, borderLeftColor: '#C8A96B' },
  quoteSelected: {
    borderLeftColor: colors.primary,
    backgroundColor: '#F4FAF2',
  },
  quoteHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rank: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEE3C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  quoteName: { color: colors.text, fontSize: 16, fontWeight: '900' },
  quoteMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  quoteAmount: {
    color: colors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  cheapestBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  cheapestText: { color: colors.primaryDark, fontSize: 10, fontWeight: '900' },
  difference: { color: colors.warning, fontSize: 11, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  quoteActions: { flexDirection: 'row', gap: spacing.sm },
  withdrawnCard: { backgroundColor: colors.surfaceAlt },
  withdrawnText: {
    color: colors.textMuted,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
});
