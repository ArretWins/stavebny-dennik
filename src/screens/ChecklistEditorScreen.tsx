import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CheckCircle2, LockKeyhole, Save, ShieldCheck } from 'lucide-react-native';
import {
  Card,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
} from '@/components/ui';
import {
  checklistSummary,
  checklistTemplate,
  createChecklistAnswers,
  validateChecklistCompletion,
} from '@/domain/checklists';
import { createId, localDateIso, nowIso } from '@/domain/ids';
import type {
  ChecklistAnswer,
  ChecklistAnswerResult,
  ProjectChecklist,
} from '@/domain/types';
import { t } from '@/i18n';
import { useAuth } from '@/state/auth';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

const results: Exclude<ChecklistAnswerResult, 'pending'>[] = [
  'pass',
  'fail',
  'na',
];

export function ChecklistEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { templateKey?: string; checklistId?: string } };
}) {
  const { userId } = useAuth();
  const { selectedProject, state, saveProjectChecklist, syncNow } = useApp();
  const existing = state.projectChecklists.find(
    item => item.id === route.params?.checklistId,
  );
  const template = checklistTemplate(
    existing?.templateKey ?? route.params?.templateKey ?? '',
  );
  const initialAnswers = useMemo(
    () =>
      existing?.answers ??
      (template ? createChecklistAnswers(template, key => t(key)) : []),
    [existing?.id, template?.key],
  );
  const [answers, setAnswers] = useState<ChecklistAnswer[]>(initialAnswers);
  const [inspectionDate, setInspectionDate] = useState(
    existing?.inspectionDate ?? localDateIso(),
  );
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const readOnly = existing?.status === 'completed';
  const summary = checklistSummary(answers);

  const updateAnswer = (
    index: number,
    patch: Partial<ChecklistAnswer>,
  ) => {
    if (readOnly) return;
    setAnswers(current =>
      current.map((answer, answerIndex) =>
        answerIndex === index ? { ...answer, ...patch } : answer,
      ),
    );
  };

  const buildChecklist = (
    status: ProjectChecklist['status'],
  ): ProjectChecklist | undefined => {
    if (!userId || !selectedProject || !template) return undefined;
    const at = nowIso();
    return {
      id: existing?.id ?? createId('checklist'),
      ownerId: userId,
      projectId: selectedProject.id,
      templateKey: template.key,
      templateName: existing?.templateName ?? t(template.titleKey),
      category: template.category,
      inspectionDate,
      answers,
      status,
      note: note.trim() || undefined,
      confirmedAt: status === 'completed' ? at : undefined,
      confirmedBy: status === 'completed' ? userId : undefined,
      syncStatus: 'pending',
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
  };

  const persistChecklist = async (
    status: ProjectChecklist['status'],
  ) => {
    const checklist = buildChecklist(status);
    if (!checklist) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inspectionDate)) {
      Alert.alert(t('checklists.invalidDate'));
      return;
    }
    if (status === 'completed') {
      const validation = validateChecklistCompletion(answers);
      if (validation) {
        Alert.alert(
          t(
            validation === 'missing_answers'
              ? 'checklists.errors.missingAnswers'
              : 'checklists.errors.failedNote',
          ),
        );
        return;
      }
    }
    setBusy(true);
    try {
      await saveProjectChecklist(checklist);
      void syncNow().catch(() => undefined);
      Alert.alert(
        t(
          status === 'completed'
            ? 'checklists.completedMessage'
            : 'checklists.saved',
        ),
        undefined,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const confirmCompletion = () =>
    Alert.alert(
      t('checklists.confirmTitle'),
      t('checklists.confirmHint'),
      [
        { text: t('app.cancel'), style: 'cancel' },
        {
          text: t('checklists.confirmAction'),
          onPress: () => void persistChecklist('completed'),
        },
      ],
    );

  if (!template || !selectedProject) return null;
  return (
    <ScreenShell>
      <TopBar
        title={existing?.templateName ?? t(template.titleKey)}
        onBack={() => navigation.goBack()}
      />
      {readOnly ? (
        <Card style={styles.locked}>
          <View style={styles.row}>
            <LockKeyhole color={colors.primary} size={25} />
            <View style={styles.flex}>
              <Text style={styles.lockedTitle}>
                {t('checklists.confirmed')}
              </Text>
              <Text style={styles.meta}>
                {existing?.confirmedAt
                  ? new Date(existing.confirmedAt).toLocaleString('sk-SK')
                  : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.meta}>{t('checklists.immutableHint')}</Text>
        </Card>
      ) : (
        <Card style={styles.notice}>
          <View style={styles.row}>
            <ShieldCheck color={colors.primary} size={25} />
            <Text style={[styles.meta, styles.flex]}>
              {t('checklists.editorHint')}
            </Text>
          </View>
        </Card>
      )}
      <TextField
        label={t('checklists.inspectionDate')}
        value={inspectionDate}
        editable={!readOnly}
        onChangeText={setInspectionDate}
        placeholder="RRRR-MM-DD"
      />
      {answers.map((answer, index) => (
        <Card
          key={answer.itemKey}
          style={{
            ...styles.answerCard,
            borderLeftColor:
              answer.result === 'fail'
                ? colors.danger
                : answer.result === 'pass'
                  ? colors.primary
                  : colors.border,
          }}
        >
          <Text style={styles.answerLabel}>
            {index + 1}. {answer.label}
          </Text>
          <View style={styles.resultRow}>
            {results.map(result => (
              <Pressable
                key={result}
                accessibilityRole="button"
                accessibilityState={{ selected: answer.result === result }}
                disabled={readOnly}
                onPress={() => updateAnswer(index, { result })}
                style={[
                  styles.result,
                  answer.result === result && styles.resultSelected,
                  result === 'fail' &&
                    answer.result === result &&
                    styles.resultFailed,
                ]}
              >
                <Text
                  style={[
                    styles.resultText,
                    answer.result === result && styles.resultTextSelected,
                  ]}
                >
                  {t(`checklists.results.${result}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          {answer.result === 'fail' ? (
            <TextArea
              label={t('checklists.failureNote')}
              value={answer.note ?? ''}
              editable={!readOnly}
              maxLength={500}
              onChangeText={value => updateAnswer(index, { note: value })}
              placeholder={t('checklists.failureNotePlaceholder')}
            />
          ) : null}
        </Card>
      ))}
      <Card>
        <Text style={styles.summary}>
          {t('checklists.summary', summary)}
        </Text>
      </Card>
      <TextArea
        label={t('checklists.generalNote')}
        value={note}
        editable={!readOnly}
        maxLength={1500}
        onChangeText={setNote}
        placeholder={t('checklists.generalNotePlaceholder')}
      />
      {!readOnly ? (
        <>
          <SecondaryButton
            title={t('checklists.saveDraft')}
            icon={Save}
            disabled={busy}
            onPress={() => void persistChecklist('draft')}
          />
          <PrimaryButton
            title={t('checklists.complete')}
            icon={CheckCircle2}
            disabled={busy}
            onPress={confirmCompletion}
          />
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  notice: { backgroundColor: colors.primarySoft },
  locked: {
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  lockedTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  answerCard: { borderLeftWidth: 5 },
  answerLabel: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  resultRow: { flexDirection: 'row', gap: spacing.sm },
  result: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  resultSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  resultFailed: {
    borderColor: colors.danger,
    backgroundColor: '#FDECEC',
  },
  resultText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  resultTextSelected: { color: colors.text },
  summary: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
