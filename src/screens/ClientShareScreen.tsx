import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Share2,
  ShieldCheck,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from '@/components/ui';
import type {
  CreatedProjectShareLink,
  ProjectShareLink,
  SiteTask,
} from '@/domain/types';
import { t } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import {
  createProjectShareLink,
  listProjectShareLinks,
  revokeProjectShareLink,
} from '@/services/clientSharing';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

const expiryOptions = [24, 168, 720] as const;

function expiryLabel(hours: number): string {
  if (hours === 24) return t('clientShare.expiry24h');
  if (hours === 720) return t('clientShare.expiry30d');
  return t('clientShare.expiry7d');
}

function linkStatus(link: ProjectShareLink): {
  label: string;
  tone: 'active' | 'inactive';
} {
  if (link.revokedAt)
    return { label: t('clientShare.revoked'), tone: 'inactive' };
  if (new Date(link.expiresAt).getTime() <= Date.now())
    return { label: t('clientShare.expired'), tone: 'inactive' };
  return { label: t('clientShare.active'), tone: 'active' };
}

function WorkVisibilityRow({
  task,
  busy,
  onToggle,
}: {
  task: SiteTask;
  busy: boolean;
  onToggle: () => void;
}) {
  const visible = Boolean(task.clientVisible);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: visible, disabled: busy }}
      disabled={busy}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.workRow,
        visible && styles.workRowVisible,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.visibilityIcon, visible && styles.visibilityIconOn]}>
        {visible ? (
          <Eye color={colors.surface} size={19} />
        ) : (
          <EyeOff color={colors.textMuted} size={19} />
        )}
      </View>
      <View style={styles.flex}>
        <Text style={styles.workTitle}>{task.title}</Text>
        <Text style={styles.meta}>
          {task.completedAt ? formatDateTime(task.completedAt) : ''}
        </Text>
      </View>
      <View style={[styles.check, visible && styles.checkOn]}>
        {visible ? <Check color={colors.surface} size={15} /> : null}
      </View>
    </Pressable>
  );
}

export function ClientShareScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, setSiteTaskClientVisibility } = useApp();
  const [expiresHours, setExpiresHours] = useState<number>(168);
  const [links, setLinks] = useState<ProjectShareLink[]>([]);
  const [created, setCreated] = useState<CreatedProjectShareLink>();
  const [busyTaskId, setBusyTaskId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const completedTasks = useMemo(
    () =>
      state.siteTasks.filter(
        (task) =>
          task.projectId === selectedProject?.id && task.status === 'done',
      ),
    [selectedProject?.id, state.siteTasks],
  );

  const refreshLinks = async () => {
    if (!selectedProject) return;
    setLinks(await listProjectShareLinks(selectedProject.id));
  };

  useEffect(() => {
    void refreshLinks().catch(() => Alert.alert(t('errors.generic')));
  }, [selectedProject?.id]);

  const toggleTask = async (task: SiteTask) => {
    setBusyTaskId(task.id);
    try {
      await setSiteTaskClientVisibility(task.id, !task.clientVisible);
    } catch {
      Alert.alert(t('clientShare.visibilityFailed'));
    } finally {
      setBusyTaskId(undefined);
    }
  };

  const createLink = async () => {
    if (!selectedProject) return;
    setBusy(true);
    try {
      const link = await createProjectShareLink(
        selectedProject.id,
        expiresHours,
      );
      setCreated(link);
      await refreshLinks();
    } catch {
      Alert.alert(t('clientShare.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = (link: ProjectShareLink) => {
    Alert.alert(t('clientShare.revokeTitle'), t('clientShare.revokeHint'), [
      { text: t('app.cancel'), style: 'cancel' },
      {
        text: t('clientShare.revoke'),
        style: 'destructive',
        onPress: () => {
          void revokeProjectShareLink(link.id)
            .then(refreshLinks)
            .catch(() => Alert.alert(t('errors.generic')));
        },
      },
    ]);
  };

  if (!selectedProject)
    return (
      <ScreenShell>
        <EmptyState title={t('projects.noProjects')} />
      </ScreenShell>
    );

  return (
    <ScreenShell>
      <TopBar
        title={t('clientShare.title')}
        onBack={() => navigation.goBack()}
      />
      <Card style={styles.intro}>
        <View style={styles.introIcon}>
          <ShieldCheck color={colors.primaryDark} size={28} />
        </View>
        <Text style={styles.introText}>{t('clientShare.intro')}</Text>
      </Card>

      <Text style={styles.sectionTitle}>{t('clientShare.visibleWorks')}</Text>
      {completedTasks.map((task) => (
        <WorkVisibilityRow
          key={task.id}
          task={task}
          busy={busyTaskId === task.id}
          onToggle={() => void toggleTask(task)}
        />
      ))}
      {!completedTasks.length ? (
        <EmptyState
          title={t('clientShare.noCompleted')}
          hint={t('clientShare.noCompletedHint')}
        />
      ) : null}

      <Text style={styles.sectionTitle}>{t('clientShare.expiry')}</Text>
      <View style={styles.expiryRow}>
        {expiryOptions.map((hours) => (
          <Pressable
            key={hours}
            accessibilityState={{ selected: expiresHours === hours }}
            onPress={() => setExpiresHours(hours)}
            style={[
              styles.expiry,
              expiresHours === hours && styles.expirySelected,
            ]}
          >
            <Text
              style={[
                styles.expiryText,
                expiresHours === hours && styles.expiryTextSelected,
              ]}
            >
              {expiryLabel(hours)}
            </Text>
          </Pressable>
        ))}
      </View>
      <PrimaryButton
        title={t('clientShare.create')}
        icon={Link2}
        disabled={busy}
        onPress={() => void createLink()}
      />

      {created ? (
        <Card style={styles.createdCard}>
          <Text style={styles.createdTitle}>{t('clientShare.created')}</Text>
          <Text style={styles.createdHint}>
            {t('clientShare.createdHint')}
          </Text>
          <Text selectable numberOfLines={3} style={styles.linkText}>
            {created.url}
          </Text>
          <SecondaryButton
            title={t('clientShare.copy')}
            icon={Copy}
            onPress={() => {
              void Clipboard.setStringAsync(created.url).then(() =>
                Alert.alert(t('clientShare.copied')),
              );
            }}
          />
          <PrimaryButton
            title={t('clientShare.share')}
            icon={Share2}
            onPress={() => void Share.share({ message: created.url })}
          />
        </Card>
      ) : null}

      <Text style={styles.sectionTitle}>{t('clientShare.links')}</Text>
      {links.map((link) => {
        const status = linkStatus(link);
        return (
          <Card key={link.id}>
            <View style={styles.linkHeader}>
              <View
                style={[
                  styles.status,
                  status.tone === 'active' && styles.statusActive,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    status.tone === 'active' && styles.statusTextActive,
                  ]}
                >
                  {status.label}
                </Text>
              </View>
              <Text style={styles.meta}>
                {t('clientShare.views', { count: link.viewCount })}
              </Text>
            </View>
            <Text style={styles.linkDate}>
              {t('clientShare.expiresAt', {
                date: formatDateTime(link.expiresAt),
              })}
            </Text>
            <Text style={styles.meta}>
              {link.lastViewedAt
                ? t('clientShare.lastViewed', {
                    date: formatDateTime(link.lastViewedAt),
                  })
                : t('clientShare.neverViewed')}
            </Text>
            {status.tone === 'active' ? (
              <SecondaryButton
                title={t('clientShare.revoke')}
                onPress={() => revoke(link)}
              />
            ) : null}
          </Card>
        );
      })}
      {!links.length ? (
        <Text style={styles.emptyLinks}>{t('clientShare.noLinks')}</Text>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { flexDirection: 'row', alignItems: 'center' },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  workRow: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  workRowVisible: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  visibilityIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityIconOn: { backgroundColor: colors.primary },
  workTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  pressed: { opacity: 0.78 },
  expiryRow: { flexDirection: 'row', gap: spacing.sm },
  expiry: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expirySelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  expiryText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  expiryTextSelected: { color: colors.primaryDark },
  createdCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  createdTitle: { color: colors.primaryDark, fontSize: 18, fontWeight: '800' },
  createdHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  linkText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  linkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  status: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusActive: { backgroundColor: colors.primarySoft },
  statusText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  statusTextActive: { color: colors.primaryDark },
  linkDate: { color: colors.text, fontSize: 13, fontWeight: '700' },
  emptyLinks: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
