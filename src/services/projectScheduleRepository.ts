import type { ProjectSchedule } from '@/domain/types';
import { supabase } from './supabase';

function fromRow(row: Record<string, unknown>): ProjectSchedule {
  return {
    projectId: String(row.project_id),
    ownerId: String(row.owner_id),
    startDate: String(row.start_date),
    targetCompletionDate: String(row.target_completion_date),
    note: row.note ? String(row.note) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveRemoteProjectSchedule(
  schedule: ProjectSchedule,
): Promise<ProjectSchedule> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase
    .from('project_schedules')
    .upsert(
      {
        project_id: schedule.projectId,
        owner_id: schedule.ownerId,
        start_date: schedule.startDate,
        target_completion_date: schedule.targetCompletionDate,
        note: schedule.note?.trim() || null,
      },
      { onConflict: 'project_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}

export async function getProjectSchedule(
  projectId: string,
): Promise<ProjectSchedule | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('project_schedules')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Record<string, unknown>) : undefined;
}

