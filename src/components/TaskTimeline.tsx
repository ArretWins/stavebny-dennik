import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  ArrowRight,
  CircleUserRound,
  History,
  MessageSquareText,
} from 'lucide-react-native';
import { Card, PrimaryButton, TextArea } from './ui';
import type {
  ProjectWorker,
  SiteTaskEvent,
  SiteTaskStatus,
} from '@/domain/types';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme/tokens';

function eventTitle(event: SiteTaskEvent): string {
  if (event.eventType === 'client_decision')
    return t('taskTimeline.clientDecision');
  if (event.eventType === 'comment') return t('taskTimeline.comment');
  if (event.eventType === 'created') return t('taskTimeline.created');
  if (event.eventType === 'assignment_changed')
    return t('taskTimeline.assignmentChanged');
  if (event.eventType === 'updated') return t('taskTimeline.updated');
  return t('taskTimeline.statusChanged');
}

function eventDetail(
  event: SiteTaskEvent,
  workers: ProjectWorker[],
): React.ReactNode {
  if (event.eventType === 'status_changed') {
    const from = String(event.metadata.from ?? 'open') as SiteTaskStatus;
    const to = String(event.metadata.to ?? 'open') as SiteTaskStatus;
    return (
      <View style={styles.transition}>
        <Text style={styles.statusText}>
          {t(`siteTasks.statusValues.${from}`)}
        </Text>
        <ArrowRight color={colors.textMuted} size={15} />
        <Text style={styles.statusText}>
          {t(`siteTasks.statusValues.${to}`)}
        </Text>
      </View>
    );
  }
  if (event.eventType === 'assignment_changed') {
    const worker = workers.find(
      item => item.id === String(event.metadata.to ?? ''),
    );
    return (
      <Text style={styles.detail}>
        {worker
          ? `${worker.firstName} ${worker.lastName}`
          : t('siteTasks.unassigned')}
      </Text>
    );
  }
  if (event.eventType === 'client_decision') {
    const accepted = event.metadata.decision === 'accept';
    return (
      <View>
        <Text style={styles.clientDecision}>
          {t(
            accepted
              ? 'taskTimeline.clientAccepted'
              : 'taskTimeline.clientRework',
          )}
        </Text>
        {event.body ? <Text style={styles.body}>{event.body}</Text> : null}
      </View>
    );
  }
  return event.body ? <Text style={styles.body}>{event.body}</Text> : null;
}

export function TaskTimeline({
  events,
  workers,
  onComment,
}: {
  events: SiteTaskEvent[];
  workers: ProjectWorker[];
  onComment: (body: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const ordered = useMemo(
    () => [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [events],
  );
  const submit = async () => {
    const body = comment.trim();
    if (!body) {
      Alert.alert(t('taskTimeline.commentRequired'));
      return;
    }
    setBusy(true);
    try {
      await onComment(body);
      setComment('');
    } catch {
      Alert.alert(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.timelineCard}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <History color={colors.primary} size={24} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{t('taskTimeline.title')}</Text>
          <Text style={styles.hint}>{t('taskTimeline.hint')}</Text>
        </View>
      </View>
      <View style={styles.timeline}>
        {ordered.length ? (
          ordered.map(event => {
            const worker = workers.find(item => item.id === event.actorWorkerId);
            const actor = worker
              ? `${worker.firstName} ${worker.lastName}`
              : event.eventType === 'client_decision'
                ? String(
                    event.metadata.signerName ?? t('taskTimeline.client'),
                  )
                : event.actorUserId
                  ? t('taskTimeline.foreman')
                  : t('taskTimeline.system');
            return (
              <View style={styles.event} key={event.id}>
                <View
                  style={[
                    styles.dot,
                    event.eventType === 'comment' && styles.commentDot,
                  ]}
                />
                <View style={styles.flex}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventTitle}>{eventTitle(event)}</Text>
                    <Text style={styles.time}>
                      {new Date(event.createdAt).toLocaleString('sk-SK')}
                    </Text>
                  </View>
                  <View style={styles.actor}>
                    <CircleUserRound color={colors.textMuted} size={14} />
                    <Text style={styles.actorText}>{actor}</Text>
                  </View>
                  {eventDetail(event, workers)}
                  {event.syncStatus !== 'synced' ? (
                    <Text style={styles.pending}>
                      {t('taskTimeline.pending')}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.hint}>{t('taskTimeline.empty')}</Text>
        )}
      </View>
      <View style={styles.composer}>
        <TextArea
          label={t('taskTimeline.addComment')}
          value={comment}
          maxLength={1000}
          onChangeText={setComment}
          placeholder={t('taskTimeline.commentPlaceholder')}
        />
        <PrimaryButton
          title={t('taskTimeline.send')}
          icon={MessageSquareText}
          disabled={busy || !comment.trim()}
          onPress={() => void submit()}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  timelineCard: { borderTopWidth: 4, borderTopColor: colors.primary },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headingIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  flex: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  timeline: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    marginLeft: 8,
    paddingLeft: spacing.lg,
    gap: spacing.lg,
  },
  event: { flexDirection: 'row', gap: spacing.sm },
  dot: {
    position: 'absolute',
    left: -22,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  commentDot: { backgroundColor: colors.warning },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eventTitle: { color: colors.text, fontSize: 14, fontWeight: '800', flex: 1 },
  time: { color: colors.textMuted, fontSize: 10 },
  actor: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actorText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  body: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  detail: { color: colors.text, fontSize: 13, marginTop: spacing.xs },
  clientDecision: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  transition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statusText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  pending: { color: colors.warning, fontSize: 11, fontWeight: '700' },
  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
});
