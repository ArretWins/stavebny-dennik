import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BadgeEuro, CalendarClock, Send, Save } from 'lucide-react-native';
import {
  Card,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TextArea,
  TextField,
  TopBar,
} from '@/components/ui';
import { formatEuroAmount } from '@/domain/receipts';
import {
  parseChangeOrderAmount,
  parseScheduleImpact,
  validateChangeOrder,
} from '@/domain/changeOrders';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

export function ChangeOrderEditorScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params?: { changeOrderId?: string } };
}) {
  const {
    selectedProject,
    state,
    saveChangeOrder,
    syncNow,
  } = useApp();
  const existing = state.changeOrders.find(
    item => item.id === route.params?.changeOrderId,
  );
  const editable = !existing || existing.status === 'draft';
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [amount, setAmount] = useState(
    existing ? (existing.amountCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [days, setDays] = useState(String(existing?.scheduleImpactDays ?? 0));
  const [relatedTaskId, setRelatedTaskId] = useState(existing?.relatedTaskId);
  const [busy, setBusy] = useState(false);
  const projectTasks = useMemo(
    () =>
      state.siteTasks.filter(item => item.projectId === selectedProject?.id),
    [selectedProject?.id, state.siteTasks],
  );
  const amountCents = parseChangeOrderAmount(amount);
  const scheduleDays = parseScheduleImpact(days);

  const persistOrder = async (submit: boolean) => {
    if (!selectedProject || busy) return;
    const validation = validateChangeOrder({
      title,
      description,
      amountCents,
      scheduleImpactDays: scheduleDays,
    });
    if (validation !== 'ok') {
      Alert.alert(
        t(
          validation === 'title'
            ? 'changeOrders.invalidTitle'
            : validation === 'description'
              ? 'changeOrders.invalidDescription'
              : validation === 'amount'
                ? 'changeOrders.invalidAmount'
                : 'changeOrders.invalidDays',
        ),
      );
      return;
    }
    if (amountCents === undefined || scheduleDays === undefined) return;
    setBusy(true);
    try {
      await saveChangeOrder({
        id: existing?.id,
        projectId: selectedProject.id,
        title,
        description,
        amountCents,
        scheduleImpactDays: scheduleDays,
        relatedTaskId,
        status: submit ? 'pending_client' : 'draft',
      });
      void syncNow().catch(() => undefined);
      Alert.alert(
        t(submit ? 'changeOrders.submitted' : 'changeOrders.saved'),
        undefined,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    Alert.alert(
      t('changeOrders.submitTitle'),
      t('changeOrders.submitHint'),
      [
        { text: t('siteTasks.cancel'), style: 'cancel' },
        {
          text: t('changeOrders.submitConfirm'),
          onPress: () => void persistOrder(true),
        },
      ],
    );

  return (
    <ScreenShell>
      <TopBar
        title={
          existing?.orderNumber
            ? t('changeOrders.number', { number: existing.orderNumber })
            : t('changeOrders.editorTitle')
        }
        onBack={() => navigation.goBack()}
      />
      {!editable ? (
        <Card style={styles.locked}>
          <Text style={styles.lockedTitle}>
            {t(`changeOrders.status.${existing.status}`)}
          </Text>
          <Text style={styles.lockedText}>{t('changeOrders.immutable')}</Text>
        </Card>
      ) : null}
      <TextField
        label={t('changeOrders.titleLabel')}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        editable={editable}
        placeholder={t('changeOrders.titlePlaceholder')}
      />
      <TextArea
        label={t('changeOrders.descriptionLabel')}
        value={description}
        onChangeText={setDescription}
        maxLength={1200}
        editable={editable}
        placeholder={t('changeOrders.descriptionPlaceholder')}
      />
      <View style={styles.inputs}>
        <View style={styles.flex}>
          <TextField
            label={t('changeOrders.amountLabel')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={editable}
            placeholder={t('changeOrders.amountPlaceholder')}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={t('changeOrders.daysLabel')}
            value={days}
            onChangeText={setDays}
            keyboardType="numbers-and-punctuation"
            editable={editable}
            placeholder={t('changeOrders.daysPlaceholder')}
          />
        </View>
      </View>
      <Card style={styles.impactCard}>
        <View style={styles.impact}>
          <BadgeEuro color={colors.warning} size={23} />
          <View>
            <Text style={styles.impactLabel}>
              {t('changeOrders.priceImpact')}
            </Text>
            <Text style={styles.impactValue}>
              {amountCents === undefined
                ? '—'
                : `${amountCents > 0 ? '+' : ''}${formatEuroAmount(amountCents)}`}
            </Text>
          </View>
        </View>
        <View style={styles.impact}>
          <CalendarClock color={colors.primary} size={23} />
          <View>
            <Text style={styles.impactLabel}>
              {t('changeOrders.scheduleImpact')}
            </Text>
            <Text style={styles.impactValue}>
              {scheduleDays === undefined
                ? '—'
                : scheduleDays === 0
                  ? t('changeOrders.noScheduleImpact')
                  : `${scheduleDays > 0 ? '+' : ''}${t('changeOrders.days', {
                      count: scheduleDays,
                    })}`}
            </Text>
          </View>
        </View>
      </Card>
      <Text style={styles.sectionTitle}>{t('changeOrders.relatedTask')}</Text>
      <View style={styles.taskChoices}>
        <Pressable
          disabled={!editable}
          onPress={() => setRelatedTaskId(undefined)}
          style={[
            styles.taskChoice,
            !relatedTaskId && styles.taskChoiceSelected,
          ]}
        >
          <Text style={styles.taskChoiceText}>{t('changeOrders.noTask')}</Text>
        </Pressable>
        {projectTasks.map(task => (
          <Pressable
            key={task.id}
            disabled={!editable}
            onPress={() => setRelatedTaskId(task.id)}
            style={[
              styles.taskChoice,
              relatedTaskId === task.id && styles.taskChoiceSelected,
            ]}
          >
            <Text style={styles.taskChoiceText} numberOfLines={2}>
              {task.title}
            </Text>
          </Pressable>
        ))}
      </View>
      {editable ? (
        <>
          <SecondaryButton
            title={t('changeOrders.saveDraft')}
            icon={Save}
            disabled={busy}
            onPress={() => void persistOrder(false)}
          />
          <PrimaryButton
            title={t('changeOrders.submit')}
            icon={Send}
            disabled={busy}
            onPress={submit}
          />
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  locked: {
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  lockedTitle: { color: colors.primaryDark, fontSize: 16, fontWeight: '900' },
  lockedText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  inputs: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  impactCard: {
    flexDirection: 'row',
    padding: 0,
    overflow: 'hidden',
    borderRadius: radius.md,
  },
  impact: {
    flex: 1,
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderLeftWidth: 5,
    borderLeftColor: '#C8A96B',
  },
  impactLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  impactValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  taskChoices: { gap: spacing.sm },
  taskChoice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  taskChoiceSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  taskChoiceText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
