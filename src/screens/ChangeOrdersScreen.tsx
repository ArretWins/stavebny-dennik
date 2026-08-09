import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BadgeEuro,
  CalendarClock,
  FilePenLine,
  Plus,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  PrimaryButton,
  ScreenShell,
  TopBar,
} from '@/components/ui';
import type { ChangeOrder } from '@/domain/types';
import { formatEuroAmount } from '@/domain/receipts';
import { t } from '@/i18n';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

function scheduleLabel(days: number): string {
  if (!days) return t('changeOrders.noScheduleImpact');
  const prefix = days > 0 ? '+' : '';
  return `${prefix}${t('changeOrders.days', { count: days })}`;
}

function ChangeOrderCard({
  item,
  onPress,
}: {
  item: ChangeOrder;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card
        style={{
          ...styles.card,
          borderLeftColor:
            item.status === 'pending_client'
              ? colors.warning
              : item.status === 'accepted'
                ? colors.primary
                : item.status === 'rejected'
                  ? colors.danger
                  : colors.border,
        }}
      >
        <View style={styles.cardHead}>
          <View style={styles.documentCode}>
            <FilePenLine color={colors.primaryDark} size={18} />
            <Text style={styles.documentCodeText}>
              {item.orderNumber
                ? t('changeOrders.number', { number: item.orderNumber })
                : t('changeOrders.unnumbered')}
            </Text>
          </View>
          <View style={[styles.status, styles[`status_${item.status}`]]}>
            <Text style={styles.statusText}>
              {t(`changeOrders.status.${item.status}`)}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.description} numberOfLines={3}>
          {item.description}
        </Text>
        <View style={styles.impactRail}>
          <View style={styles.impact}>
            <BadgeEuro color={colors.warning} size={20} />
            <View>
              <Text style={styles.impactLabel}>
                {t('changeOrders.priceImpact')}
              </Text>
              <Text style={styles.impactValue}>
                {item.amountCents > 0 ? '+' : ''}
                {formatEuroAmount(item.amountCents)}
              </Text>
            </View>
          </View>
          <View style={styles.impact}>
            <CalendarClock color={colors.primary} size={20} />
            <View>
              <Text style={styles.impactLabel}>
                {t('changeOrders.scheduleImpact')}
              </Text>
              <Text style={styles.impactValue}>
                {scheduleLabel(item.scheduleImpactDays)}
              </Text>
            </View>
          </View>
        </View>
        {item.signerName ? (
          <Text style={styles.decision}>
            {t('changeOrders.decisionBy', { name: item.signerName })}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

export function ChangeOrdersScreen({ navigation }: { navigation: any }) {
  const { selectedProject, state, refreshProjectData } = useApp();
  useEffect(() => {
    void refreshProjectData();
  }, [refreshProjectData]);
  const orders = useMemo(
    () =>
      state.changeOrders
        .filter(item => item.projectId === selectedProject?.id)
        .sort(
          (left, right) =>
            (right.orderNumber ?? 0) - (left.orderNumber ?? 0) ||
            right.createdAt.localeCompare(left.createdAt),
        ),
    [selectedProject?.id, state.changeOrders],
  );
  return (
    <ScreenShell>
      <TopBar title={t('changeOrders.title')} onBack={() => navigation.goBack()} />
      <Card style={styles.intro}>
        <View style={styles.introIcon}>
          <FilePenLine color={colors.primaryDark} size={28} />
        </View>
        <Text style={styles.introText}>{t('changeOrders.intro')}</Text>
      </Card>
      <PrimaryButton
        title={t('changeOrders.new')}
        icon={Plus}
        onPress={() => navigation.navigate('ChangeOrderEditor')}
      />
      {orders.length ? (
        orders.map(item => (
          <ChangeOrderCard
            key={item.id}
            item={item}
            onPress={() =>
              navigation.navigate('ChangeOrderEditor', {
                changeOrderId: item.id,
              })
            }
          />
        ))
      ) : (
        <EmptyState
          title={t('changeOrders.empty')}
          hint={t('changeOrders.emptyHint')}
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 5,
    borderLeftColor: '#C8A96B',
  },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: '#EFE6D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  card: { borderLeftWidth: 5, borderLeftColor: colors.border },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  documentCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  documentCodeText: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  status: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.surfaceAlt,
  },
  status_draft: { backgroundColor: colors.surfaceAlt },
  status_pending_client: { backgroundColor: colors.warningSoft },
  status_accepted: { backgroundColor: colors.primarySoft },
  status_rejected: { backgroundColor: '#FDE8E5' },
  status_cancelled: { backgroundColor: colors.surfaceAlt },
  statusText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  impactRail: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  impact: {
    flex: 1,
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: '#C8A96B',
  },
  impactLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  impactValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 3,
  },
  decision: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
});
