import type { WorkShift, WorkShiftEvent } from '@/domain/types';
import { supabase } from './supabase';

function row(value: unknown): Record<string, unknown> {
  const result = Array.isArray(value) ? value[0] : value;
  if (!result || typeof result !== 'object') throw new Error('INVALID_WORK_SHIFT_RESPONSE');
  return result as Record<string, unknown>;
}

function shiftFromRow(item: Record<string, unknown>): WorkShift {
  return {
    id: String(item.id), ownerId: String(item.owner_id), projectId: String(item.project_id), workerId: String(item.worker_id),
    shiftDate: String(item.shift_date), startedAt: String(item.started_at), endedAt: item.ended_at ? String(item.ended_at) : undefined,
    breakMinutes: Number(item.break_minutes), note: item.note ? String(item.note) : undefined,
    source: item.source as WorkShift['source'], status: item.status as WorkShift['status'],
    approvedAt: item.approved_at ? String(item.approved_at) : undefined, approvedBy: item.approved_by ? String(item.approved_by) : undefined,
    syncStatus: 'synced', createdAt: String(item.created_at), updatedAt: String(item.updated_at),
  };
}

function eventFromRow(item: Record<string, unknown>): WorkShiftEvent {
  return {
    id: String(item.id), ownerId: String(item.owner_id), projectId: String(item.project_id), shiftId: String(item.shift_id), workerId: String(item.worker_id),
    eventType: item.event_type as WorkShiftEvent['eventType'], body: item.body ? String(item.body) : undefined,
    metadata: (item.metadata ?? {}) as Record<string, unknown>, actorUserId: item.actor_user_id ? String(item.actor_user_id) : undefined, createdAt: String(item.created_at),
  };
}

export async function listProjectWorkShifts(projectId: string): Promise<{ shifts: WorkShift[]; events: WorkShiftEvent[] }> {
  if (!supabase) return { shifts: [], events: [] };
  const from = new Date(); from.setDate(from.getDate() - 92);
  const [shifts, events] = await Promise.all([
    supabase.from('work_shifts').select('*').eq('project_id', projectId).gte('shift_date', from.toISOString().slice(0, 10)).order('started_at', { ascending: false }),
    supabase.from('work_shift_events').select('*').eq('project_id', projectId).gte('created_at', from.toISOString()).order('created_at'),
  ]);
  if (shifts.error) throw shifts.error;
  if (events.error) throw events.error;
  return { shifts: (shifts.data ?? []).map(item => shiftFromRow(item as Record<string, unknown>)), events: (events.data ?? []).map(item => eventFromRow(item as Record<string, unknown>)) };
}

export async function saveRemoteWorkShift(shift: WorkShift): Promise<WorkShift> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('save_work_shift', { p_id: shift.id, p_project_id: shift.projectId, p_worker_id: shift.workerId, p_started_at: shift.startedAt, p_ended_at: shift.endedAt, p_break_minutes: shift.breakMinutes, p_note: shift.note ?? null });
  if (error) throw error;
  return shiftFromRow(row(data));
}

export async function approveRemoteWorkShift(id: string): Promise<WorkShift> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('approve_work_shift', { p_shift_id: id });
  if (error) throw error;
  return shiftFromRow(row(data));
}

export async function reopenRemoteWorkShift(id: string, reason: string): Promise<WorkShift> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('reopen_work_shift', { p_shift_id: id, p_reason: reason });
  if (error) throw error;
  return shiftFromRow(row(data));
}
