import * as Crypto from 'expo-crypto';
import { canonicalDayClosureSnapshot } from '@/domain/dayClosure';
import type { DayClosureRecord, DayClosureSnapshot } from '@/domain/types';
import { supabase } from './supabase';

export async function hashDayClosureSnapshot(
  snapshot: DayClosureSnapshot,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalDayClosureSnapshot(snapshot),
  );
}

function mapClosure(row: Record<string, any>): DayClosureRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    logDate: String(row.log_date),
    version: Number(row.version),
    supersedesClosureId: row.supersedes_closure_id
      ? String(row.supersedes_closure_id)
      : undefined,
    correctionReason: row.correction_reason
      ? String(row.correction_reason)
      : undefined,
    snapshot: row.snapshot_json as DayClosureSnapshot,
    contentHash: String(row.content_hash),
    confirmationVersion: 'sk-v1',
    acknowledgedWarnings: Array.isArray(row.acknowledged_warnings)
      ? row.acknowledged_warnings
      : [],
    confirmedAt: String(row.confirmed_at),
    confirmedBy: String(row.confirmed_by),
    syncStatus: 'synced',
    createdAt: String(row.created_at),
  };
}

export async function saveRemoteDayClosure(
  closure: DayClosureRecord,
): Promise<DayClosureRecord> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('confirm_day_closure', {
    p_id: closure.id,
    p_project_id: closure.projectId,
    p_log_date: closure.logDate,
    p_supersedes_closure_id: closure.supersedesClosureId ?? null,
    p_correction_reason: closure.correctionReason ?? null,
    p_acknowledged_warnings: closure.acknowledgedWarnings,
    p_confirmed: true,
  });
  if (error) throw error;
  return mapClosure(data as Record<string, any>);
}

export async function listRemoteDayClosures(
  projectId: string,
): Promise<DayClosureRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('day_closures')
    .select('*')
    .eq('project_id', projectId)
    .order('log_date', { ascending: false })
    .order('version', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapClosure(row));
}
