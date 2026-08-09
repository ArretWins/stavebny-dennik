import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import {
  Archive,
  Check,
  ClipboardCheck,
  Copy,
  Hammer,
  PackageOpen,
  RotateCcw,
  ShieldAlert,
  UserRound,
  Wrench,
} from 'lucide-react-native';
import {
  Card,
  DangerActionButton,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
  WarningActionButton,
} from '@/components/ui';
import type { ProjectTool, ProjectToolEvent } from '@/domain/types';
import {
  projectToolQrValue,
  projectToolReference,
  validateProjectTool,
} from '@/domain/tools';
import { localDateIso } from '@/domain/ids';
import { t } from '@/i18n';
import { formatDate, formatDateTime } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

type ActionMode = 'issue' | 'return' | 'problem' | 'restore' | 'retire';

const categoryKeys = [
  'electrical',
  'measuring',
  'hand',
  'safety',
  'machinery',
  'other',
] as const;

function TimelineEvent({
  event,
  workerName,
}: {
  event: ProjectToolEvent;
  workerName?: string;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={styles.timelinePoint} />
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.timelineContent}>
        <Text style={styles.timelineTitle}>
          {t(`tools.event.${event.eventType}`)}
        </Text>
        <Text style={styles.timelineMeta}>
          {formatDateTime(event.createdAt)}
          {workerName ? ` · ${workerName}` : ''}
        </Text>
        {event.body ? <Text style={styles.timelineBody}>{event.body}</Text> : null}
      </View>
    </View>
  );
}

export function ToolEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { toolId?: string } };
}) {
  const {
    selectedProject,
    state,
    saveProjectTool,
    issueProjectTool,
    returnProjectTool,
    reportProjectToolIssue,
    restoreProjectTool,
    retireProjectTool,
    syncNow,
    refreshProjectData,
  } = useApp();
  const existing = state.projectTools.find(item => item.id === route.params?.toolId);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<ActionMode>();
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setCategory(existing.category);
    setManufacturer(existing.manufacturer ?? '');
    setModel(existing.model ?? '');
    setSerialNumber(existing.serialNumber ?? '');
    setNote(existing.note ?? '');
  }, [existing?.id, existing?.updatedAt]);
  useEffect(() => {
    if (route.params?.toolId) void refreshProjectData();
  }, [refreshProjectData, route.params?.toolId]);

  const workers = useMemo(
    () =>
      state.workers.filter(
        worker =>
          worker.projectId === selectedProject?.id && worker.status === 'active',
      ),
    [selectedProject?.id, state.workers],
  );
  const events = useMemo(
    () =>
      state.projectToolEvents
        .filter(event => event.toolId === existing?.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [existing?.id, state.projectToolEvents],
  );
  if (!selectedProject)
    return (
      <ScreenShell>
        <TopBar title={t('tools.title')} onBack={() => navigation.goBack()} />
        <EmptyState title={t('projects.noProjects')} />
      </ScreenShell>
    );

  const save = async () => {
    const validation = validateProjectTool({
      name,
      category,
      manufacturer,
      model,
      serialNumber,
      note,
    });
    if (validation !== 'ok') {
      setError(t(`tools.validation.${validation}`));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveProjectTool({
        id: existing?.id,
        projectId: selectedProject.id,
        name,
        category,
        manufacturer,
        model,
        serialNumber,
        note,
      });
      if (!existing) navigation.replace('ToolEditor', { toolId: saved.id });
      void syncNow();
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message.includes('SERIAL_EXISTS')
          ? t('tools.serialExists')
          : t('errors.generic'),
      );
    } finally {
      setBusy(false);
    }
  };

  const finishAction = async (action: () => Promise<ProjectTool>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setMode(undefined);
      setSelectedWorkerId('');
      setExpectedReturnDate('');
      setActionNote('');
      await syncNow().catch(() => undefined);
      await refreshProjectData().catch(() => undefined);
    } catch {
      setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const confirmRetire = () => {
    if (!existing || actionNote.trim().length < 3) return;
    Alert.alert(t('tools.retireConfirmTitle'), t('tools.retireConfirmHint'), [
      { text: t('app.cancel'), style: 'cancel' },
      {
        text: t('tools.retire'),
        style: 'destructive',
        onPress: () =>
          void finishAction(() => retireProjectTool(existing.id, actionNote)),
      },
    ]);
  };

  const currentWorker = state.workers.find(
    worker => worker.id === existing?.currentWorkerId,
  );
  return (
    <ScreenShell>
      <TopBar
        title={existing ? projectToolReference(existing.assetNumber) : t('tools.newTitle')}
        onBack={() => navigation.goBack()}
      />
      {existing ? (
        <View style={styles.assetHeader}>
          <View style={styles.assetHeaderTop}>
            <View style={styles.assetCodeBlock}>
              <Text style={styles.assetCode}>{projectToolReference(existing.assetNumber)}</Text>
              <Text style={styles.assetCodeLabel}>{t('tools.assetCode')}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.assetName}>{existing.name}</Text>
              <Text style={styles.assetCategory}>{existing.category}</Text>
            </View>
            <View style={styles.qrMini}>
              <QRCode value={projectToolQrValue(existing.id)} size={58} backgroundColor="#FFFFFF" color="#1F2A30" />
            </View>
          </View>
          <View style={styles.assetStatusLine}>
            <Text style={styles.assetStatus}>{t(`tools.status.${existing.status}`)}</Text>
            {currentWorker ? (
              <Text style={styles.assetCustodian}>
                {currentWorker.firstName} {currentWorker.lastName}
              </Text>
            ) : null}
            {existing.expectedReturnDate ? (
              <Text style={styles.assetCustodian}>{formatDate(existing.expectedReturnDate)}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>{t('tools.identity')}</Text>
        <TextField label={t('tools.name')} value={name} onChangeText={setName} maxLength={160} />
        <Text style={styles.fieldLabel}>{t('tools.category')}</Text>
        <View style={styles.categoryGrid}>
          {categoryKeys.map(key => {
            const value = t(`tools.categories.${key}`);
            return (
              <Pressable
                key={key}
                onPress={() => setCategory(value)}
                style={[styles.categoryChip, category === value && styles.categoryChipActive]}
              >
                <Text style={[styles.categoryText, category === value && styles.categoryTextActive]}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextField label={t('tools.manufacturer')} value={manufacturer} onChangeText={setManufacturer} maxLength={100} />
        <TextField label={t('tools.model')} value={model} onChangeText={setModel} maxLength={100} />
        <TextField label={t('tools.serialNumber')} value={serialNumber} onChangeText={setSerialNumber} maxLength={120} autoCapitalize="characters" />
        <TextArea label={t('tools.note')} value={note} onChangeText={setNote} placeholder={t('tools.notePlaceholder')} maxLength={1000} />
        {existing?.status !== 'retired' ? (
          <PrimaryButton title={busy ? t('app.loading') : t('app.save')} icon={Check} disabled={busy} onPress={() => void save()} />
        ) : null}
      </Card>

      {existing ? (
        <Card style={styles.qrCard}>
          <View style={styles.qrTicketHeader}>
            <Hammer color="#E46F2E" size={25} />
            <View style={styles.flex}>
              <Text style={styles.sectionTitle}>{t('tools.qrTitle')}</Text>
              <Text style={styles.hint}>{t('tools.qrHint')}</Text>
            </View>
          </View>
          <View style={styles.qrLarge}>
            <QRCode value={projectToolQrValue(existing.id)} size={190} backgroundColor="#FFFFFF" color="#1F2A30" />
          </View>
          <SecondaryButton title={t('tools.copyQrLink')} icon={Copy} onPress={() => void Clipboard.setStringAsync(projectToolQrValue(existing.id))} />
        </Card>
      ) : null}

      {existing && existing.status !== 'retired' ? (
        <Card>
          <Text style={styles.sectionTitle}>{t('tools.custodyActions')}</Text>
          {!mode ? (
            <>
              {existing.status === 'available' ? (
                <PrimaryButton title={t('tools.issue')} icon={UserRound} onPress={() => setMode('issue')} />
              ) : null}
              {existing.status === 'issued' ? (
                <PrimaryButton title={t('tools.return')} icon={RotateCcw} onPress={() => setMode('return')} />
              ) : null}
              {['available', 'issued'].includes(existing.status) ? (
                <WarningActionButton title={t('tools.reportProblem')} icon={ShieldAlert} onPress={() => setMode('problem')} />
              ) : null}
              {['maintenance', 'lost'].includes(existing.status) ? (
                <PrimaryButton title={t('tools.restore')} icon={Wrench} onPress={() => setMode('restore')} />
              ) : null}
              {['available', 'maintenance', 'lost'].includes(existing.status) ? (
                <DangerActionButton title={t('tools.retire')} icon={Archive} onPress={() => setMode('retire')} />
              ) : null}
            </>
          ) : (
            <View style={styles.actionPanel}>
              <Text style={styles.actionTitle}>{t(`tools.action.${mode}`)}</Text>
              {mode === 'issue' ? (
                <>
                  <Text style={styles.fieldLabel}>{t('tools.selectWorker')}</Text>
                  <View style={styles.workerChoices}>
                    {workers.map(worker => (
                      <Pressable
                        key={worker.id}
                        onPress={() => setSelectedWorkerId(worker.id)}
                        style={[styles.workerChoice, selectedWorkerId === worker.id && styles.workerChoiceActive]}
                      >
                        <UserRound color={selectedWorkerId === worker.id ? '#FFFFFF' : colors.textMuted} size={18} />
                        <Text style={[styles.workerChoiceText, selectedWorkerId === worker.id && styles.workerChoiceTextActive]}>
                          {worker.firstName} {worker.lastName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {!workers.length ? <Text style={styles.hint}>{t('tools.noActiveWorkers')}</Text> : null}
                  <TextField label={t('tools.expectedReturn')} value={expectedReturnDate} onChangeText={setExpectedReturnDate} placeholder={t('rfi.datePlaceholder')} />
                </>
              ) : null}
              {mode === 'return' ? <Text style={styles.hint}>{t('tools.returnConditionHint')}</Text> : null}
              {mode === 'problem' ? <Text style={styles.hint}>{t('tools.problemHint')}</Text> : null}
              <TextArea label={mode === 'retire' ? t('tools.reason') : t('tools.actionNote')} value={actionNote} onChangeText={setActionNote} placeholder={t('tools.actionNotePlaceholder')} maxLength={1000} />
              {mode === 'issue' ? (
                <PrimaryButton title={t('tools.confirmIssue')} icon={ClipboardCheck} disabled={busy || !selectedWorkerId || (!!expectedReturnDate && expectedReturnDate < localDateIso())} onPress={() => void finishAction(() => issueProjectTool(existing.id, selectedWorkerId, expectedReturnDate || undefined, actionNote))} />
              ) : null}
              {mode === 'return' ? (
                <View style={styles.buttonRow}>
                  <PrimaryButton title={t('tools.returnServiceable')} icon={PackageOpen} disabled={busy} style={styles.flex} onPress={() => void finishAction(() => returnProjectTool(existing.id, 'serviceable', actionNote))} />
                  <WarningActionButton title={t('tools.returnDamaged')} icon={ShieldAlert} disabled={busy} style={styles.flex} onPress={() => void finishAction(() => returnProjectTool(existing.id, 'damaged', actionNote))} />
                </View>
              ) : null}
              {mode === 'problem' ? (
                <View style={styles.buttonRow}>
                  <WarningActionButton title={t('tools.damaged')} disabled={busy || actionNote.trim().length < 3} style={styles.flex} onPress={() => void finishAction(() => reportProjectToolIssue(existing.id, 'damaged', actionNote))} />
                  <DangerActionButton title={t('tools.lost')} disabled={busy || actionNote.trim().length < 3} style={styles.flex} onPress={() => void finishAction(() => reportProjectToolIssue(existing.id, 'lost', actionNote))} />
                </View>
              ) : null}
              {mode === 'restore' ? <PrimaryButton title={t('tools.confirmRestore')} icon={Wrench} disabled={busy} onPress={() => void finishAction(() => restoreProjectTool(existing.id, actionNote))} /> : null}
              {mode === 'retire' ? <DangerActionButton title={t('tools.confirmRetire')} icon={Archive} disabled={busy || actionNote.trim().length < 3} onPress={confirmRetire} /> : null}
              <SecondaryButton title={t('app.cancel')} onPress={() => { setMode(undefined); setActionNote(''); }} />
            </View>
          )}
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {existing ? (
        <Card>
          <Text style={styles.sectionTitle}>{t('tools.history')}</Text>
          {events.map(event => {
            const worker = state.workers.find(item => item.id === event.workerId);
            return <TimelineEvent key={event.id} event={event} workerName={worker ? `${worker.firstName} ${worker.lastName}` : undefined} />;
          })}
          {!events.length ? <Text style={styles.hint}>{t('tools.historyPending')}</Text> : null}
        </Card>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  assetHeader: { backgroundColor: '#1F2A30', borderRadius: radius.lg, overflow: 'hidden' },
  assetHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  assetCodeBlock: { backgroundColor: '#E46F2E', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 8 },
  assetCode: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', fontFamily: 'monospace' },
  assetCodeLabel: { color: '#FFE1CC', fontSize: 8, textTransform: 'uppercase', textAlign: 'center' },
  assetName: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  assetCategory: { color: '#AEB9BE', fontSize: 11, marginTop: 2 },
  qrMini: { padding: 4, backgroundColor: '#FFFFFF', borderRadius: 5 },
  assetStatusLine: { minHeight: 38, backgroundColor: '#121A1E', paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  assetStatus: { color: '#F6B26B', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  assetCustodian: { color: '#B9C2C7', fontSize: 11 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: { minHeight: 38, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  categoryChipActive: { backgroundColor: '#26343B', borderColor: '#26343B' },
  categoryText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  categoryTextActive: { color: '#FFFFFF' },
  qrCard: { borderStyle: 'dashed', borderWidth: 2, borderColor: '#6D7B83' },
  qrTicketHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  qrLarge: { alignSelf: 'center', padding: spacing.lg, backgroundColor: '#FFFFFF' },
  actionPanel: { gap: spacing.md, backgroundColor: '#F0F3F4', borderRadius: radius.md, padding: spacing.md },
  actionTitle: { color: '#26343B', fontSize: 15, fontWeight: '900' },
  workerChoices: { gap: spacing.sm },
  workerChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  workerChoiceActive: { backgroundColor: '#2B6F95', borderColor: '#2B6F95' },
  workerChoiceText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  workerChoiceTextActive: { color: '#FFFFFF' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  timelineRow: { flexDirection: 'row', minHeight: 62 },
  timelineRail: { width: 22, alignItems: 'center' },
  timelinePoint: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#E46F2E', borderWidth: 2, borderColor: '#FFE4D2' },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#D5DCDF' },
  timelineContent: { flex: 1, paddingBottom: spacing.md },
  timelineTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  timelineMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  timelineBody: { color: colors.text, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
