import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { BadgeCheck, CalendarClock, Check, ClipboardList, Copy, ExternalLink, Link2, QrCode, RefreshCw, ShieldCheck, Store, UserCheck, UserX, Users } from 'lucide-react-native';
import { Card, EmptyState, PrimaryButton, ScreenShell, SecondaryButton, TextField, TopBar, WarningActionButton } from '@/components/ui';
import type { MaterialRequest, MaterialRequestStatus, ProjectWorker, WorkerStatus } from '@/domain/types';
import { t } from '@/i18n';
import { formatDate, formatDateTime, formatTime } from '@/i18n/format';
import { createProjectWorkerInvite } from '@/services/workforceRepository';
import { supabase } from '@/services/supabase';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';

type Tab = 'workers' | 'requests';

function WorkerCard({ worker, busy, onStatus }: { worker: ProjectWorker; busy: boolean; onStatus: (status: Exclude<WorkerStatus, 'pending'>) => void }) {
  const pending = worker.status === 'pending';
  return <Card style={{ ...styles.boardCard, ...(pending ? styles.pendingEdge : worker.status === 'active' ? styles.activeEdge : styles.closedEdge) }}>
    <View style={styles.row}><View style={[styles.avatar, pending ? styles.avatarPending : styles.avatarActive]}><Text style={styles.avatarText}>{worker.firstName[0]}{worker.lastName[0]}</Text></View><View style={styles.flex}><Text style={styles.name}>{worker.firstName} {worker.lastName}</Text><Text style={styles.meta}>{worker.position} · {formatDateTime(worker.createdAt)}</Text></View><View style={[styles.statusChip, pending ? styles.statusPending : styles.statusActive]}><Text style={[styles.statusText, pending ? styles.statusTextPending : styles.statusTextActive]}>{t(`workerManagement.status.${worker.status}`)}</Text></View></View>
    {pending ? <View style={styles.buttonRow}><PrimaryButton title={t('workerManagement.approve')} icon={UserCheck} disabled={busy} onPress={() => onStatus('active')} style={styles.flex} /><WarningActionButton title={t('workerManagement.reject')} icon={UserX} disabled={busy} onPress={() => onStatus('rejected')} style={styles.flex} /></View> : null}
    {worker.status === 'active' ? <SecondaryButton title={t('workerManagement.revoke')} icon={UserX} disabled={busy} onPress={() => onStatus('revoked')} /> : null}
  </Card>;
}

function RequestCard({ request, worker, items, linkedCount, quoteCount, busy, rejecting, rejectionReason, onRejecting, onReason, onStatus, onLink, onProcurement }: { request: MaterialRequest; worker?: ProjectWorker; items: Array<{ id: string; name: string; quantity: number; unit: string }>; linkedCount: number; quoteCount: number; busy: boolean; rejecting: boolean; rejectionReason: string; onRejecting: () => void; onReason: (value: string) => void; onStatus: (status: Exclude<MaterialRequestStatus, 'new'>, reason?: string) => void; onLink: () => void; onProcurement: () => void }) {
  const canReject = request.status === 'new' || request.status === 'approved';
  return <Card style={{ ...styles.boardCard, ...(request.status === 'new' ? styles.pendingEdge : request.status === 'rejected' ? styles.closedEdge : styles.activeEdge) }}>
    <View style={styles.row}><ClipboardList color={request.status === 'new' ? colors.warning : colors.primary} size={27} /><View style={styles.flex}><Text style={styles.name}>{worker ? `${worker.firstName} ${worker.lastName}` : t('materialRequests.unknownWorker')}</Text><Text style={styles.meta}>{formatDateTime(request.createdAt)}{request.desiredDate ? ` · ${t('materialRequests.desired')} ${formatDate(request.desiredDate)}` : ''}</Text></View><View style={[styles.statusChip, request.status === 'new' ? styles.statusPending : styles.statusActive]}><Text style={[styles.statusText, request.status === 'new' ? styles.statusTextPending : styles.statusTextActive]}>{t(`materialRequests.status.${request.status}`)}</Text></View></View>
    <View style={styles.materialList}>{items.map(item => <View key={item.id} style={styles.materialRow}><Text style={styles.materialName}>{item.name}</Text><Text style={styles.materialAmount}>{item.quantity} {item.unit}</Text></View>)}</View>
    {request.comment ? <Text style={styles.comment}>{request.comment}</Text> : null}{request.rejectionReason ? <Text style={styles.rejection}>{request.rejectionReason}</Text> : null}
    {request.status === 'new' ? <PrimaryButton title={t('materialRequests.approve')} icon={Check} disabled={busy} onPress={() => onStatus('approved')} /> : null}
    {request.status === 'approved' && quoteCount === 0 ? <View style={styles.buttonRow}><SecondaryButton title={t('materialRequests.partial')} disabled={busy} onPress={() => onStatus('partially_purchased')} style={styles.flex} /><PrimaryButton title={t('materialRequests.purchased')} disabled={busy} onPress={() => onStatus('purchased')} style={styles.flex} /></View> : null}
    {request.status === 'partially_purchased' && quoteCount === 0 ? <PrimaryButton title={t('materialRequests.purchased')} icon={Check} disabled={busy} onPress={() => onStatus('purchased')} /> : null}
    {canReject && !rejecting ? <WarningActionButton title={t('materialRequests.reject')} icon={UserX} disabled={busy} onPress={onRejecting} /> : null}
    {rejecting ? <View style={styles.rejectBox}><TextField label={t('materialRequests.rejectionReason')} value={rejectionReason} onChangeText={onReason} placeholder={t('materialRequests.rejectionPlaceholder')} /><WarningActionButton title={t('materialRequests.confirmReject')} disabled={busy || !rejectionReason.trim()} onPress={() => onStatus('rejected', rejectionReason)} /></View> : null}
    {request.status === 'approved' || request.status === 'partially_purchased' || request.status === 'purchased' ? <PrimaryButton title={quoteCount ? t('procurement.openWithCount', { count: quoteCount }) : t('procurement.open')} icon={Store} onPress={onProcurement} /> : null}
    {request.status === 'approved' || request.status === 'partially_purchased' || request.status === 'purchased' ? <SecondaryButton title={linkedCount ? t('materialRequests.linkedReceipts', { count: linkedCount }) : t('materialRequests.linkReceipt')} icon={Link2} onPress={onLink} /> : null}
  </Card>;
}

export function WorkforceScreen({ navigation, route }: { navigation: any; route: { params?: { tab?: Tab } } }) {
  const { selectedProject, state, refreshWorkforce, reviewWorker, updateMaterialRequest } = useApp();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'workers'); const [invite, setInvite] = useState<{ link: string; expiresAt: string }>(); const [busyId, setBusyId] = useState<string>();
  const [rejectingId, setRejectingId] = useState<string>(); const [rejectionReason, setRejectionReason] = useState(''); const [creatingInvite, setCreatingInvite] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => { try { await refreshWorkforce(); } catch { /* retry on the next interval */ } };
    void refresh();
    const timer = setInterval(() => { if (active) void refresh(); }, 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [refreshWorkforce, selectedProject?.id]);
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);
  const workers = useMemo(() => state.workers.filter(worker => worker.projectId === selectedProject?.id), [selectedProject?.id, state.workers]);
  const requests = useMemo(() => state.materialRequests.filter(request => request.projectId === selectedProject?.id), [selectedProject?.id, state.materialRequests]);
  if (!selectedProject) return <ScreenShell><TopBar title={t('workerManagement.title')} onBack={() => navigation.goBack()} /><EmptyState title={t('projects.noProjects')} /></ScreenShell>;
  const createInvite = async () => {
    if (!supabase) { Alert.alert(t('workerManagement.serverRequired'), t('workerManagement.serverRequiredHint')); return; }
    setCreatingInvite(true); try { const created = await createProjectWorkerInvite(selectedProject.id); const base = process.env.EXPO_PUBLIC_WORKER_PORTAL_URL || 'https://stavuno.pages.dev'; setInvite({ link: `${base.replace(/\/+$/, '')}/worker/?token=${encodeURIComponent(created.token)}`, expiresAt: created.expiresAt }); } catch { Alert.alert(t('errors.generic')); } finally { setCreatingInvite(false); }
  };
  const changeWorker = async (worker: ProjectWorker, status: Exclude<WorkerStatus, 'pending'>) => { setBusyId(worker.id); try { await reviewWorker(worker.id, status); } catch { Alert.alert(t('errors.generic')); } finally { setBusyId(undefined); } };
  const changeRequest = async (request: MaterialRequest, status: Exclude<MaterialRequestStatus, 'new'>, reason?: string) => { setBusyId(request.id); try { await updateMaterialRequest(request.id, status, reason); setRejectingId(undefined); setRejectionReason(''); } catch { Alert.alert(t('errors.generic')); } finally { setBusyId(undefined); } };
  const pendingCount = workers.filter(worker => worker.status === 'pending').length; const newRequestCount = requests.filter(request => request.status === 'new').length;
  return <ScreenShell key={tab}>
    <TopBar title={t('workerManagement.title')} onBack={() => navigation.goBack()} right={<Pressable accessibilityLabel={t('app.retry')} onPress={() => { void refreshWorkforce().catch(() => Alert.alert(t('errors.generic'))); }} style={styles.refresh}><RefreshCw color={colors.text} size={20} /></Pressable>} />
    <View style={styles.tabs}><Pressable onPress={() => setTab('workers')} style={[styles.tab, tab === 'workers' && styles.tabActive]}><Users color={tab === 'workers' ? colors.primary : colors.textMuted} size={20} /><Text style={[styles.tabText, tab === 'workers' && styles.tabTextActive]}>{t('workerManagement.workers')} {pendingCount ? `· ${pendingCount}` : ''}</Text></Pressable><Pressable onPress={() => setTab('requests')} style={[styles.tab, tab === 'requests' && styles.tabActive]}><ClipboardList color={tab === 'requests' ? colors.primary : colors.textMuted} size={20} /><Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>{t('materialRequests.title')} {newRequestCount ? `· ${newRequestCount}` : ''}</Text></Pressable></View>
    {tab === 'workers' ? <>
      <PrimaryButton title={t('timesheet.open')} icon={CalendarClock} onPress={() => navigation.navigate('Timesheet')} />
      <SecondaryButton title={t('workerCredentials.open')} icon={BadgeCheck} onPress={() => navigation.navigate('WorkerCredentials')} />
      <Card style={styles.inviteCard}><View style={styles.row}><View style={styles.inviteIcon}><QrCode color={colors.primary} size={30} /></View><View style={styles.flex}><Text style={styles.sectionTitle}>{t('workerManagement.invite')}</Text><Text style={styles.meta}>{selectedProject.name} · {t('workerManagement.inviteHint')}</Text></View></View>{invite ? <><View style={styles.qr}><QRCode value={invite.link} size={190} color={colors.text} backgroundColor={colors.surface} /></View><Text style={styles.expiry}>{t('workerManagement.expires', { time: formatTime(invite.expiresAt) })}</Text><View style={styles.buttonRow}><SecondaryButton title={t('checkin.copyLink')} icon={Copy} onPress={() => void Clipboard.setStringAsync(invite.link)} style={styles.flex} /><SecondaryButton title={t('checkin.link')} icon={ExternalLink} onPress={() => void Linking.openURL(invite.link)} style={styles.flex} /></View></> : <PrimaryButton title={creatingInvite ? t('app.loading') : t('workerManagement.createQr')} icon={QrCode} disabled={creatingInvite} onPress={() => void createInvite()} />}</Card>
      <Text style={styles.sectionTitle}>{t('workerManagement.pending')}</Text>{workers.filter(worker => worker.status === 'pending').map(worker => <WorkerCard key={worker.id} worker={worker} busy={busyId === worker.id} onStatus={status => void changeWorker(worker, status)} />)}{!pendingCount ? <EmptyState title={t('workerManagement.noPending')} /> : null}
      <Text style={styles.sectionTitle}>{t('workerManagement.team')}</Text>{workers.filter(worker => worker.status !== 'pending').map(worker => <WorkerCard key={worker.id} worker={worker} busy={busyId === worker.id} onStatus={status => void changeWorker(worker, status)} />)}{!workers.some(worker => worker.status !== 'pending') ? <EmptyState title={t('workerManagement.noTeam')} /> : null}
    </> : <>
      {requests.map(request => <RequestCard key={request.id} request={request} worker={workers.find(worker => worker.id === request.workerId)} items={state.materialRequestItems.filter(item => item.requestId === request.id)} linkedCount={state.receiptRequestLinks.filter(link => link.requestId === request.id).length} quoteCount={(state.materialSupplierQuotes ?? []).filter(quote => quote.requestId === request.id && quote.status !== 'withdrawn').length} busy={busyId === request.id} rejecting={rejectingId === request.id} rejectionReason={rejectionReason} onRejecting={() => { setRejectingId(request.id); setRejectionReason(''); }} onReason={setRejectionReason} onStatus={(status, reason) => void changeRequest(request, status, reason)} onLink={() => navigation.navigate('RequestReceiptLink', { requestId: request.id })} onProcurement={() => navigation.navigate('MaterialProcurement', { requestId: request.id })} />)}
      {!requests.length ? <EmptyState title={t('materialRequests.empty')} hint={t('materialRequests.emptyHint')} /> : null}
    </>}
  </ScreenShell>;
}

const styles = StyleSheet.create({
  refresh: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, tabs: { flexDirection: 'row', gap: spacing.sm }, tab: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, tabActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft }, tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' }, tabTextActive: { color: colors.primaryDark },
  inviteCard: { borderTopWidth: 5, borderTopColor: '#C8A96B' }, inviteIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, flex: { flex: 1 }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, meta: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, qr: { alignSelf: 'center', padding: spacing.md, backgroundColor: colors.surface }, expiry: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  boardCard: { borderLeftWidth: 6 }, pendingEdge: { borderLeftColor: colors.warning }, activeEdge: { borderLeftColor: colors.primary }, closedEdge: { borderLeftColor: colors.textMuted }, avatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, avatarPending: { backgroundColor: colors.warningSoft }, avatarActive: { backgroundColor: colors.primarySoft }, avatarText: { color: colors.text, fontSize: 15, fontWeight: '900' }, name: { color: colors.text, fontSize: 15, fontWeight: '800' }, statusChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 }, statusPending: { backgroundColor: colors.warningSoft }, statusActive: { backgroundColor: colors.primarySoft }, statusText: { fontSize: 10, fontWeight: '800' }, statusTextPending: { color: colors.warning }, statusTextActive: { color: colors.primaryDark }, buttonRow: { flexDirection: 'row', gap: spacing.sm },
  materialList: { borderTopWidth: 1, borderTopColor: colors.border }, materialRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border }, materialName: { color: colors.text, fontSize: 13, flex: 1 }, materialAmount: { color: colors.text, fontSize: 13, fontWeight: '800' }, comment: { color: colors.text, fontSize: 12, lineHeight: 18 }, rejection: { color: colors.warning, fontSize: 12, fontWeight: '700' }, rejectBox: { padding: spacing.md, backgroundColor: colors.warningSoft, borderRadius: radius.md, gap: spacing.sm },
});
