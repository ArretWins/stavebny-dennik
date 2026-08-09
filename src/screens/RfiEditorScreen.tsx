import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import {
  ArchiveRestore,
  Camera,
  CheckCircle2,
  FileQuestion,
  Images,
  LockKeyhole,
  MapPin,
  Send,
  UserRound,
} from 'lucide-react-native';
import {
  Card,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
  WarningActionButton,
} from '@/components/ui';
import { projectRfiReference, validateProjectRfiInput } from '@/domain/rfi';
import type { Attachment } from '@/domain/types';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import { pickPhoto, signedAttachmentUrl, type PhotoSource } from '@/services/attachments';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';

type Params = {
  rfiId?: string;
  planId?: string;
  pageNumber?: number;
  xRatio?: number;
  yRatio?: number;
};

export function RfiEditorScreen({ navigation, route }: {
  navigation: any;
  route: { params?: Params };
}) {
  const { userId } = useAuth();
  const {
    selectedProject, state, saveProjectRfi, openProjectRfi, answerProjectRfi,
    closeProjectRfi, reopenProjectRfi, addAttachment, syncNow, refreshProjectData,
  } = useApp();
  const existing = state.projectRfis.find(item => item.id === route.params?.rfiId);
  const planId = existing?.planId ?? route.params?.planId;
  const plan = state.projectPlans.find(item => item.id === planId);
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [question, setQuestion] = useState(existing?.question ?? '');
  const [recipientName, setRecipientName] = useState(existing?.recipientName ?? '');
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [answer, setAnswer] = useState('');
  const [answeredBy, setAnsweredBy] = useState(existing?.recipientName ?? '');
  const [reopenReason, setReopenReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [remoteUris, setRemoteUris] = useState<Record<string, string>>({});
  const photos = state.attachments.filter(item =>
    item.relatedEntityType === 'project_rfi' && item.relatedEntityId === existing?.id,
  );
  const events = useMemo(() =>
    state.projectRfiEvents.filter(item => item.rfiId === existing?.id),
  [existing?.id, state.projectRfiEvents]);
  useEffect(() => { if (existing?.id) void refreshProjectData(); }, [existing?.id]);
  useEffect(() => {
    let active = true;
    void Promise.all(photos.filter(photo => photo.storagePath).map(async photo =>
      [photo.id, await signedAttachmentUrl(photo.storagePath!)] as const,
    )).then(entries => {
      if (active) setRemoteUris(Object.fromEntries(entries.filter(entry => entry[1])) as Record<string, string>);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [photos.map(photo => `${photo.id}:${photo.storagePath ?? ''}`).join('|')]);
  if (!selectedProject)
    return <ScreenShell><TopBar title={t('rfi.title')} onBack={() => navigation.goBack()} /></ScreenShell>;

  const pin = {
    planId,
    pageNumber: existing?.pageNumber ?? route.params?.pageNumber,
    xRatio: existing?.xRatio ?? route.params?.xRatio,
    yRatio: existing?.yRatio ?? route.params?.yRatio,
  };
  const editable = !existing || existing.status === 'draft';
  const saveDraft = async () => {
    const validation = validateProjectRfiInput({
      subject, question, recipientName, dueDate: dueDate || undefined, ...pin,
    });
    if (validation !== 'ok') {
      setError(t(`rfi.errors.${validation}`));
      return undefined;
    }
    setBusy(true);
    setError(undefined);
    try {
      const saved = await saveProjectRfi({
        id: existing?.id,
        projectId: selectedProject.id,
        subject,
        question,
        recipientName,
        dueDate: dueDate || undefined,
        ...pin,
      });
      if (!existing) navigation.replace('RfiEditor', { rfiId: saved.id });
      void syncNow().catch(() => undefined);
      return saved;
    } catch {
      setError(t('errors.generic'));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const confirmOpen = () => Alert.alert(
    t('rfi.openTitle'), t('rfi.openHint'), [
      { text: t('app.cancel'), style: 'cancel' },
      { text: t('rfi.openConfirm'), onPress: () => {
        setBusy(true);
        void (async () => {
          const saved = existing ?? await saveDraft();
          if (!saved) return;
          await openProjectRfi(saved.id);
          await syncNow();
        })().catch(() => Alert.alert(t('errors.generic'))).finally(() => setBusy(false));
      } },
    ],
  );
  const recordAnswer = async () => {
    if (answer.trim().length < 3 || answeredBy.trim().length < 2) {
      setError(t('rfi.errors.answer'));
      return;
    }
    setBusy(true);
    try {
      await answerProjectRfi(existing!.id, answer, answeredBy);
      setAnswer('');
      await syncNow();
    } catch { Alert.alert(t('errors.generic')); }
    finally { setBusy(false); }
  };
  const confirmClose = () => Alert.alert(t('rfi.closeTitle'), t('rfi.closeHint'), [
    { text: t('app.cancel'), style: 'cancel' },
    { text: t('rfi.closeConfirm'), onPress: () => {
      setBusy(true);
      void closeProjectRfi(existing!.id).then(syncNow).catch(() => Alert.alert(t('errors.generic'))).finally(() => setBusy(false));
    } },
  ]);
  const reopen = async () => {
    if (reopenReason.trim().length < 5) { setError(t('rfi.errors.reopen')); return; }
    setBusy(true);
    try { await reopenProjectRfi(existing!.id, reopenReason); setReopenReason(''); await syncNow(); }
    catch { Alert.alert(t('errors.generic')); }
    finally { setBusy(false); }
  };
  const addPhoto = async (source: PhotoSource) => {
    if (!userId || !existing) return;
    setBusy(true);
    try {
      const photo = await pickPhoto(userId, selectedProject.id, 'project_rfi', source, existing.id);
      if (photo) { await addAttachment(photo); await syncNow(); }
    } catch { Alert.alert(t('errors.fileUnsupported')); }
    finally { setBusy(false); }
  };

  return (
    <ScreenShell>
      <TopBar title={existing ? projectRfiReference(existing.rfiNumber) : t('rfi.newTitle')} onBack={() => navigation.goBack()} />
      <Card style={styles.docket}>
        <View style={styles.docketRow}>
          <View style={styles.docketIcon}><FileQuestion color="#F2C14E" size={30} /></View>
          <View style={styles.flex}>
            <Text style={styles.kicker}>{existing ? projectRfiReference(existing.rfiNumber) : t('rfi.draftReference')}</Text>
            <Text style={styles.docketTitle}>{existing?.subject || t('rfi.newTitle')}</Text>
            <Text style={styles.docketMeta}>{t('rfi.exactRevisionHint')}</Text>
          </View>
          {existing && existing.status !== 'draft' ? <LockKeyhole color="#D5E2EA" size={22} /> : null}
        </View>
      </Card>
      {editable ? <>
        <TextField label={t('rfi.subject')} value={subject} onChangeText={setSubject} maxLength={160} placeholder={t('rfi.subjectPlaceholder')} />
        <TextArea label={t('rfi.question')} value={question} onChangeText={setQuestion} maxLength={4000} placeholder={t('rfi.questionPlaceholder')} />
        <TextField label={t('rfi.recipient')} value={recipientName} onChangeText={setRecipientName} maxLength={160} placeholder={t('rfi.recipientPlaceholder')} />
        <TextField label={t('rfi.due')} value={dueDate} onChangeText={setDueDate} placeholder={t('rfi.datePlaceholder')} />
      </> : <Card style={styles.questionCard}>
        <Text style={styles.label}>{t('rfi.question')}</Text><Text style={styles.question}>{existing.question}</Text>
        <View style={styles.person}><UserRound color={colors.textMuted} size={17} /><Text style={styles.meta}>{existing.recipientName}</Text></View>
      </Card>}
      {plan ? <Card style={styles.anchorCard}>
        <MapPin color="#2B6F95" size={24} /><View style={styles.flex}><Text style={styles.anchorTitle}>{t('rfi.drawingAnchor')}</Text><Text style={styles.meta}>{t('rfi.planRevision', { name: plan.name, version: plan.versionNumber, page: pin.pageNumber ?? 1 })}</Text></View>
        <SecondaryButton title={t('planning.openPlan')} onPress={() => navigation.navigate('PlanBoard', { planId: plan.id })} />
      </Card> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {editable ? <>
        <PrimaryButton title={t('rfi.saveDraft')} icon={CheckCircle2} disabled={busy} onPress={() => void saveDraft()} />
        <PrimaryButton title={t('rfi.open')} icon={Send} disabled={busy} onPress={confirmOpen} />
      </> : null}
      {existing ? <Card>
        <Text style={styles.sectionTitle}>{t('rfi.photos')}</Text>
        {photos.length ? <View style={styles.photos}>{photos.map(photo => <Image key={photo.id} source={{ uri: remoteUris[photo.id] || photo.localUri }} style={styles.photo} />)}</View> : <Text style={styles.meta}>{t('rfi.noPhotos')}</Text>}
        <View style={styles.actions}><SecondaryButton title={t('siteTasks.camera')} icon={Camera} style={styles.flex} disabled={busy} onPress={() => void addPhoto('camera')} /><SecondaryButton title={t('siteTasks.gallery')} icon={Images} style={styles.flex} disabled={busy} onPress={() => void addPhoto('library')} /></View>
      </Card> : null}
      {existing?.status === 'open' ? <Card style={styles.answerCard}>
        <Text style={styles.sectionTitle}>{t('rfi.recordAnswer')}</Text>
        <TextArea label={t('rfi.answer')} value={answer} onChangeText={setAnswer} maxLength={4000} placeholder={t('rfi.answerPlaceholder')} />
        <TextField label={t('rfi.answeredBy')} value={answeredBy} onChangeText={setAnsweredBy} maxLength={160} />
        <PrimaryButton title={t('rfi.saveAnswer')} icon={CheckCircle2} disabled={busy} onPress={() => void recordAnswer()} />
      </Card> : null}
      {existing?.answer ? <Card style={styles.acceptedAnswer}>
        <Text style={styles.answerStamp}>{t('rfi.answerStamp')}</Text><Text style={styles.answerText}>{existing.answer}</Text><Text style={styles.meta}>{t('rfi.answeredByValue', { name: existing.answeredByName ?? '', date: formatDateTime(existing.answeredAt ?? existing.updatedAt) })}</Text>
      </Card> : null}
      {existing?.status === 'answered' ? <PrimaryButton title={t('rfi.close')} icon={LockKeyhole} disabled={busy} onPress={confirmClose} /> : null}
      {existing && (existing.status === 'answered' || existing.status === 'closed') ? <Card>
        <TextArea label={t('rfi.reopenReason')} value={reopenReason} onChangeText={setReopenReason} maxLength={500} placeholder={t('rfi.reopenPlaceholder')} />
        <WarningActionButton title={t('rfi.reopen')} icon={ArchiveRestore} disabled={busy} onPress={() => void reopen()} />
      </Card> : null}
      {events.length ? <Card>
        <Text style={styles.sectionTitle}>{t('rfi.history')}</Text>
        {events.map(event => <View key={event.id} style={styles.event}><View style={styles.eventDot} /><View style={styles.flex}><Text style={styles.eventTitle}>{t(`rfi.event.${event.eventType}`)}</Text>{event.body ? <Text style={styles.eventBody}>{event.body}</Text> : null}<Text style={styles.meta}>{formatDateTime(event.createdAt)}</Text></View></View>)}
      </Card> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  docket: { backgroundColor: '#133B5C', borderTopWidth: 6, borderTopColor: '#F2C14E' },
  docketRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  docketIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: '#214F70', alignItems: 'center', justifyContent: 'center' },
  kicker: { color: '#F2C14E', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  docketTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  docketMeta: { color: '#D5E2EA', fontSize: 11, lineHeight: 16 },
  questionCard: { borderLeftWidth: 5, borderLeftColor: '#2B6F95' },
  label: { color: colors.textMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  question: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  anchorCard: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 5, borderLeftColor: '#2B6F95' },
  anchorTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  error: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 92, height: 92, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  actions: { flexDirection: 'row', gap: spacing.sm },
  answerCard: { borderTopWidth: 5, borderTopColor: colors.primary },
  acceptedAnswer: { backgroundColor: colors.primarySoft, borderLeftWidth: 5, borderLeftColor: colors.primary },
  answerStamp: { alignSelf: 'flex-start', color: colors.primaryDark, borderWidth: 2, borderColor: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: 5, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  answerText: { color: colors.text, fontSize: 15, lineHeight: 23, fontWeight: '700' },
  event: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: '#2B6F95' },
  eventTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  eventBody: { color: colors.text, fontSize: 12, lineHeight: 18 },
});
