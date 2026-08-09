import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Pdf from 'react-native-pdf';
import { ChevronLeft, ChevronRight, FileQuestion, MapPin, Plus, X } from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  SecondaryButton,
  TopBar,
} from '@/components/ui';
import { normalizePlanCoordinate } from '@/domain/planTasks';
import type { SiteTask } from '@/domain/types';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

type Size = { width: number; height: number };
type Frame = Size & { left: number; top: number };

function containedFrame(container: Size, content: Size): Frame {
  if (!container.width || !container.height || !content.width || !content.height)
    return { left: 0, top: 0, ...container };
  const scale = Math.min(
    container.width / content.width,
    container.height / content.height,
  );
  const width = content.width * scale;
  const height = content.height * scale;
  return {
    width,
    height,
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
  };
}

function pinColor(task: SiteTask): string {
  if (task.status === 'done') return colors.primary;
  if (task.priority === 'urgent') return colors.danger;
  if (task.priority === 'high') return colors.warning;
  return colors.text;
}

export function PlanBoardScreen({
  navigation,
  route,
}: {
  navigation: any;
  route: { params: { planId: string } };
}) {
  const { state, updateProjectPlanPageCount } = useApp();
  const plan = state.projectPlans.find(item => item.id === route.params.planId);
  const [page, setPage] = useState(1);
  const [addingKind, setAddingKind] = useState<'task' | 'rfi'>();
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const [content, setContent] = useState<Size>({ width: 1, height: 1.414 });
  const tasks = useMemo(
    () =>
      state.siteTasks.filter(
        task => task.planId === plan?.id && task.pageNumber === page,
      ),
    [page, plan?.id, state.siteTasks],
  );
  const rfis = useMemo(
    () => state.projectRfis.filter(
      rfi => rfi.planId === plan?.id && rfi.pageNumber === page,
    ),
    [page, plan?.id, state.projectRfis],
  );
  if (!plan)
    return (
      <ScreenShell>
        <TopBar title={t('planning.title')} onBack={() => navigation.goBack()} />
        <EmptyState title={t('planning.loadFailed')} />
      </ScreenShell>
    );

  const frame = containedFrame(container, content);
  const onContainerLayout = (event: LayoutChangeEvent) => {
    setContainer({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };
  const addAtPoint = (event: GestureResponderEvent) => {
    if (!addingKind || !frame.width || !frame.height) return;
    const xRatio = normalizePlanCoordinate(
      event.nativeEvent.locationX / frame.width,
    );
    const yRatio = normalizePlanCoordinate(
      event.nativeEvent.locationY / frame.height,
    );
    const params = {
      planId: plan.id,
      pageNumber: page,
      xRatio,
      yRatio,
    };
    setAddingKind(undefined);
    navigation.navigate(addingKind === 'rfi' ? 'RfiEditor' : 'TaskEditor', params);
  };
  const previous = () => setPage(value => Math.max(1, value - 1));
  const next = () => setPage(value => Math.min(plan.pageCount, value + 1));

  return (
    <ScreenShell>
      <TopBar title={plan.name} onBack={() => navigation.goBack()} />
      <Card style={styles.instructions}>
        <MapPin color={colors.primary} size={22} />
        <Text style={styles.instructionsText}>{t('planning.boardHint')}</Text>
      </Card>
      <View style={styles.pageControls}>
        <Pressable
          accessibilityLabel={t('planning.previousPage')}
          disabled={page <= 1}
          onPress={previous}
          style={[styles.pageButton, page <= 1 && styles.disabled]}
        >
          <ChevronLeft color={colors.text} size={22} />
        </Pressable>
        <Text style={styles.pageLabel}>
          {t('planning.page', { current: page, total: plan.pageCount })}
        </Text>
        <Pressable
          accessibilityLabel={t('planning.nextPage')}
          disabled={page >= plan.pageCount}
          onPress={next}
          style={[
            styles.pageButton,
            page >= plan.pageCount && styles.disabled,
          ]}
        >
          <ChevronRight color={colors.text} size={22} />
        </Pressable>
      </View>
      {addingKind ? (
        <PrimaryButton
          title={t('planning.addingPin')}
          icon={X}
          onPress={() => setAddingKind(undefined)}
        />
      ) : (
        <View style={styles.addActions}>
          <PrimaryButton
            title={t('planning.addPin')}
            icon={MapPin}
            style={styles.flex}
            onPress={() => setAddingKind('task')}
          />
          <SecondaryButton
            title={t('rfi.addPin')}
            icon={FileQuestion}
            style={styles.flex}
            onPress={() => setAddingKind('rfi')}
          />
        </View>
      )}
      <View style={styles.board} onLayout={onContainerLayout}>
        <View
          style={[
            styles.planFrame,
            {
              left: frame.left,
              top: frame.top,
              width: frame.width,
              height: frame.height,
            },
          ]}
        >
          {plan.mimeType === 'application/pdf' ? (
            <View pointerEvents="none" style={styles.document}>
              <Pdf
                source={{ uri: plan.localUri, cache: true }}
                page={page}
                singlePage
                fitPolicy={0}
                style={styles.document}
                onLoadComplete={(numberOfPages, _path, size) => {
                  if (size?.width && size?.height)
                    setContent({ width: size.width, height: size.height });
                  if (numberOfPages !== plan.pageCount)
                    void updateProjectPlanPageCount(plan.id, numberOfPages);
                }}
                onError={() => undefined}
              />
            </View>
          ) : (
            <Image
              source={{ uri: plan.localUri }}
              style={styles.document}
              resizeMode="contain"
              onLoad={event => {
                const source = event.nativeEvent.source;
                if (source?.width && source?.height)
                  setContent({ width: source.width, height: source.height });
              }}
            />
          )}
          {addingKind ? (
            <Pressable
              accessibilityLabel={t('planning.addingPin')}
              onPress={addAtPoint}
              style={styles.pinCapture}
            >
              <View style={styles.crosshair}>
                <Plus color={colors.primary} size={30} />
              </View>
            </Pressable>
          ) : null}
          {tasks.map((task, index) => (
            <Pressable
              key={task.id}
              accessibilityLabel={task.title}
              onPress={() =>
                navigation.navigate('TaskEditor', { taskId: task.id })
              }
              style={[
                styles.pin,
                {
                  left: (task.xRatio ?? 0) * frame.width - 15,
                  top: (task.yRatio ?? 0) * frame.height - 15,
                  backgroundColor: pinColor(task),
                },
              ]}
            >
              <Text style={styles.pinText}>{index + 1}</Text>
            </Pressable>
          ))}
          {rfis.map(rfi => (
            <Pressable
              key={rfi.id}
              accessibilityLabel={rfi.subject}
              onPress={() => navigation.navigate('RfiEditor', { rfiId: rfi.id })}
              style={[
                styles.rfiPin,
                {
                  left: (rfi.xRatio ?? 0) * frame.width - 15,
                  top: (rfi.yRatio ?? 0) * frame.height - 15,
                },
              ]}
            >
              <Text style={styles.rfiPinText}>?</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {tasks.map((task, index) => (
        <Card key={task.id} style={styles.task}>
          <View style={[styles.legend, { backgroundColor: pinColor(task) }]}>
            <Text style={styles.pinText}>{index + 1}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.meta}>
              {t(`siteTasks.statusValues.${task.status}`)} ·{' '}
              {t(`siteTasks.priorityValues.${task.priority}`)}
            </Text>
          </View>
          <SecondaryButton
            title={t('siteTasks.edit')}
            onPress={() =>
              navigation.navigate('TaskEditor', { taskId: task.id })
            }
          />
        </Card>
      ))}
      {rfis.map(rfi => (
        <Card key={rfi.id} style={styles.rfiLegendCard}>
          <View style={styles.rfiLegend}><Text style={styles.rfiPinText}>?</Text></View>
          <View style={styles.flex}>
            <Text style={styles.taskTitle}>{rfi.subject}</Text>
            <Text style={styles.meta}>{t(`rfi.status.${rfi.status}`)} · {rfi.recipientName}</Text>
          </View>
          <SecondaryButton title={t('rfi.openDetail')} onPress={() => navigation.navigate('RfiEditor', { rfiId: rfi.id })} />
        </Card>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
  },
  instructionsText: { color: colors.text, fontSize: 12, flex: 1, lineHeight: 18 },
  pageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addActions: { flexDirection: 'row', gap: spacing.sm },
  pageButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.35 },
  pageLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  board: {
    height: 500,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#E7E5E0',
  },
  planFrame: { position: 'absolute', overflow: 'hidden' },
  document: { width: '100%', height: '100%', backgroundColor: colors.surface },
  pinCapture: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(46, 125, 50, 0.08)',
  },
  crosshair: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  pin: {
    position: 'absolute',
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 2,
    borderColor: colors.surface,
    elevation: 5,
  },
  pinText: { color: colors.surface, fontSize: 11, fontWeight: '900' },
  rfiPin: {
    position: 'absolute', width: 30, height: 30, alignItems: 'center',
    justifyContent: 'center', borderRadius: 4, borderWidth: 2,
    borderColor: colors.surface, backgroundColor: '#2B6F95', elevation: 5,
    transform: [{ rotate: '45deg' }],
  },
  rfiPinText: { color: colors.surface, fontSize: 15, fontWeight: '900', transform: [{ rotate: '-45deg' }] },
  task: { flexDirection: 'row', alignItems: 'center' },
  rfiLegendCard: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 5, borderLeftColor: '#2B6F95' },
  rfiLegend: { width: 30, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2B6F95', transform: [{ rotate: '45deg' }] },
  legend: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  taskTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
});
