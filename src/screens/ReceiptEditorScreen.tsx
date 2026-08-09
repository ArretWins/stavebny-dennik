import React, { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowDown, ArrowUp, Camera, FilePlus2, FileText, Images, Plus, Trash2 } from 'lucide-react-native';
import { Card, Field, PrimaryButton, ScreenShell, SecondaryButton, TextArea, TextField, TopBar } from '@/components/ui';
import { createId, localDateIso, nowIso } from '@/domain/ids';
import { metadataDuplicateCandidates, parseEuroAmount, validateReceipt } from '@/domain/receipts';
import type { Receipt, ReceiptFile } from '@/domain/types';
import { t } from '@/i18n';
import { pickReceiptPdf, pickReceiptPhotos, reorderReceiptFiles } from '@/services/receiptFiles';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

export function ReceiptEditorScreen({ navigation, route }: { navigation: any; route: { params?: { receiptId?: string } } }) {
  const { selectedProject, state, addReceiptCategory, saveReceipt } = useApp();
  const existing = state.receipts.find(receipt => receipt.id === route.params?.receiptId);
  const receiptId = useRef(existing?.id ?? createId('receipt')).current;
  const categories = state.receiptCategories.filter(category => category.ownerId === (existing?.ownerId ?? state.receiptCategories[0]?.ownerId));
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchaseDate ?? localDateIso());
  const [seller, setSeller] = useState(existing?.seller ?? '');
  const [amount, setAmount] = useState(existing?.totalAmountCents === undefined ? '' : (existing.totalAmountCents / 100).toFixed(2).replace('.', ','));
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id);
  const [note, setNote] = useState(existing?.note ?? '');
  const [files, setFiles] = useState<ReceiptFile[]>(() => state.receiptFiles.filter(file => file.receiptId === receiptId).sort((a, b) => a.pageOrder - b.pageOrder));
  const [customCategory, setCustomCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const ownerId = existing?.ownerId ?? categories[0]?.ownerId;
  const duplicateCount = useMemo(() => {
    if (!ownerId || !selectedProject) return 0;
    const candidate: Receipt = { id: receiptId, ownerId, projectId: selectedProject.id, categoryId, purchaseDate, seller, totalAmountCents: parseEuroAmount(amount), currency: 'EUR', status: 'draft', ocrStatus: 'pending', syncStatus: 'pending', createdAt: existing?.createdAt ?? nowIso(), updatedAt: nowIso() };
    return metadataDuplicateCandidates(candidate, state.receipts).length;
  }, [amount, categoryId, existing?.createdAt, ownerId, purchaseDate, receiptId, selectedProject, seller, state.receipts]);

  if (!selectedProject || !ownerId) return <ScreenShell><TopBar title={t('receipts.editorTitle')} onBack={() => navigation.goBack()} /></ScreenShell>;
  const addPhotos = async (source: 'library' | 'camera') => {
    try { const picked = await pickReceiptPhotos(ownerId, selectedProject.id, receiptId, source, files.length); setFiles(current => [...current, ...picked]); }
    catch (error) { Alert.alert(t('errors.generic'), t(error instanceof Error && error.message === 'CAMERA_PERMISSION_DENIED' ? 'errors.cameraPermission' : error instanceof Error && error.message === 'RECEIPT_FILE_TOO_LARGE' ? 'receipts.errors.tooLarge' : 'receipts.errors.file')); }
  };
  const addPdf = async () => { try { const file = await pickReceiptPdf(ownerId, selectedProject.id, receiptId, files.length); if (file) setFiles(current => [...current, file]); } catch (error) { Alert.alert(t('errors.generic'), t(error instanceof Error && error.message === 'RECEIPT_FILE_TOO_LARGE' ? 'receipts.errors.tooLarge' : 'receipts.errors.file')); } };
  const chooseFile = () => Alert.alert(t('receipts.addDocument'), t('receipts.addDocumentHint'), [
    { text: t('app.cancel'), style: 'cancel' }, { text: t('receipts.galleryMultiple'), onPress: () => void addPhotos('library') },
    { text: t('receipts.importPdf'), onPress: () => void addPdf() },
  ]);
  const save = async () => {
    const totalAmountCents = amount.trim() ? parseEuroAmount(amount) : undefined;
    if (amount.trim() && totalAmountCents === undefined) { Alert.alert(t('receipts.errors.invalidAmount')); return; }
    const draft: Receipt = { id: receiptId, ownerId, projectId: selectedProject.id, categoryId, purchaseDate: purchaseDate || undefined, seller: seller || undefined, totalAmountCents, currency: 'EUR', note: note || undefined, status: existing?.status ?? 'draft', ocrStatus: existing?.ocrStatus ?? 'pending', ocrConfidence: existing?.ocrConfidence, ocrError: existing?.ocrError, syncStatus: 'pending', createdAt: existing?.createdAt ?? nowIso(), updatedAt: nowIso() };
    const error = validateReceipt(draft, files);
    if (error === 'files_required') { Alert.alert(t('receipts.errors.documentRequired')); return; }
    setSaving(true);
    try { await saveReceipt(draft, files); Alert.alert(t('receipts.saved'), duplicateCount ? t('receipts.duplicateWarning', { count: duplicateCount }) : t('receipts.savedHint'), [{ text: t('app.close'), onPress: () => navigation.goBack() }]); }
    catch { Alert.alert(t('errors.generic')); setSaving(false); }
  };
  const createCategory = async () => { if (!customCategory.trim()) return; const category = await addReceiptCategory(customCategory); setCategoryId(category.id); setCustomCategory(''); };

  return <ScreenShell>
    <TopBar title={existing ? t('receipts.editTitle') : t('receipts.editorTitle')} onBack={() => navigation.goBack()} />
    <Card style={styles.documentCard}>
      <View style={styles.documentHeader}><View><Text style={styles.sectionTitle}>{t('receipts.documents')}</Text><Text style={styles.hint}>{t('receipts.documentsHint')}</Text></View><View style={styles.pageBadge}><Text style={styles.pageBadgeText}>{files.length}/20</Text></View></View>
      {files.map((file, index) => <View key={file.id} style={styles.fileRow}>
        <View style={styles.preview}>{file.mimeType.startsWith('image/') ? <Image source={{ uri: file.localUri }} style={styles.previewImage} /> : <FileText color={colors.danger} size={25} />}</View>
        <View style={styles.fileBody}><Text style={styles.fileTitle}>{file.mimeType === 'application/pdf' ? t('receipts.pdfDocument') : t('receipts.photoPage', { count: index + 1 })}</Text><Text style={styles.hint}>{Math.max(1, Math.round(file.fileSize / 1024))} KB</Text></View>
        <Pressable accessibilityLabel={t('receipts.moveUp')} disabled={!index} onPress={() => setFiles(current => reorderReceiptFiles(current, index, index - 1))} style={[styles.smallButton, !index && styles.disabled]}><ArrowUp color={colors.text} size={18} /></Pressable>
        <Pressable accessibilityLabel={t('receipts.moveDown')} disabled={index === files.length - 1} onPress={() => setFiles(current => reorderReceiptFiles(current, index, index + 1))} style={[styles.smallButton, index === files.length - 1 && styles.disabled]}><ArrowDown color={colors.text} size={18} /></Pressable>
        <Pressable accessibilityLabel={t('receipts.removeFile')} onPress={() => setFiles(current => current.filter(item => item.id !== file.id).map((item, pageOrder) => ({ ...item, pageOrder })))} style={styles.smallButton}><Trash2 color={colors.danger} size={18} /></Pressable>
      </View>)}
      <Pressable onPress={chooseFile} style={styles.addDocument}><FilePlus2 color={colors.primary} size={26} /><Text style={styles.addDocumentTitle}>{t('receipts.addDocument')}</Text><Text style={styles.hint}>{t('receipts.addDocumentHint')}</Text></Pressable>
      <View style={styles.quickActions}><SecondaryButton title={t('attachments.camera')} icon={Camera} onPress={() => void addPhotos('camera')} style={styles.quickButton} /><SecondaryButton title={t('receipts.galleryShort')} icon={Images} onPress={() => void addPhotos('library')} style={styles.quickButton} /></View>
      <SecondaryButton title={t('receipts.importPdf')} icon={FileText} onPress={() => void addPdf()} />
    </Card>
    <TextField label={t('receipts.purchaseDate')} value={purchaseDate} onChangeText={setPurchaseDate} placeholder={t('receipts.datePlaceholder')} />
    <TextField label={t('receipts.seller')} value={seller} onChangeText={setSeller} placeholder={t('receipts.sellerPlaceholder')} />
    <TextField label={t('receipts.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={t('receipts.amountPlaceholder')} />
    <Field label={t('receipts.category')}><View style={styles.categories}>{categories.map(category => <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.category, categoryId === category.id && styles.categorySelected]}><Text style={[styles.categoryText, categoryId === category.id && styles.categoryTextSelected]}>{category.name}</Text></Pressable>)}</View></Field>
    <View style={styles.customCategory}><View style={styles.customInput}><TextField label={t('receipts.customCategory')} value={customCategory} onChangeText={setCustomCategory} placeholder={t('receipts.customCategoryPlaceholder')} /></View><Pressable accessibilityLabel={t('receipts.addCategory')} disabled={!customCategory.trim()} onPress={() => void createCategory()} style={[styles.addCategory, !customCategory.trim() && styles.disabled]}><Plus color={colors.surface} size={22} /></Pressable></View>
    <TextArea label={t('receipts.note')} value={note} onChangeText={setNote} maxLength={500} placeholder={t('receipts.notePlaceholder')} />
    {duplicateCount ? <View style={styles.duplicate}><Text style={styles.duplicateTitle}>{t('receipts.possibleDuplicate')}</Text><Text style={styles.duplicateText}>{t('receipts.duplicateWarning', { count: duplicateCount })}</Text></View> : null}
    <PrimaryButton title={saving ? t('app.loading') : t('receipts.save')} onPress={() => void save()} disabled={saving} />
  </ScreenShell>;
}

const styles = StyleSheet.create({
  documentCard: { gap: spacing.md }, documentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' }, hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, pageBadge: { borderRadius: radius.sm, backgroundColor: colors.primarySoft, paddingHorizontal: spacing.sm, paddingVertical: 5 }, pageBadgeText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  fileRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }, preview: { width: 46, height: 54, backgroundColor: '#F1EEE7', borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, previewImage: { width: '100%', height: '100%', resizeMode: 'cover' }, fileBody: { flex: 1 }, fileTitle: { color: colors.text, fontSize: 12, fontWeight: '700' }, smallButton: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.surfaceAlt }, disabled: { opacity: 0.35 },
  addDocument: { minHeight: 104, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, backgroundColor: '#FBFEFA', alignItems: 'center', justifyContent: 'center', gap: 3, padding: spacing.md }, addDocumentTitle: { color: colors.text, fontSize: 14, fontWeight: '800' }, quickActions: { flexDirection: 'row', gap: spacing.sm }, quickButton: { flex: 1 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, category: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, categorySelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, categoryText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' }, categoryTextSelected: { color: colors.primaryDark },
  customCategory: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }, customInput: { flex: 1 }, addCategory: { width: 48, height: 48, marginBottom: 1, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, duplicate: { borderRadius: radius.md, borderWidth: 1, borderColor: '#F7BD6F', backgroundColor: colors.warningSoft, padding: spacing.md }, duplicateTitle: { color: colors.warning, fontSize: 13, fontWeight: '800' }, duplicateText: { color: colors.text, fontSize: 12, marginTop: 3 },
});
