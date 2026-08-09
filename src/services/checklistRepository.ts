import type { ProjectChecklist } from '@/domain/types';
import { supabase } from './supabase';

function checklistFromRow(row: Record<string, unknown>): ProjectChecklist {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    templateKey: String(row.template_key),
    templateName: String(row.template_name),
    category: row.category as ProjectChecklist['category'],
    inspectionDate: String(row.inspection_date),
    answers: (row.answers ?? []) as ProjectChecklist['answers'],
    status: row.status as ProjectChecklist['status'],
    note: row.note ? String(row.note) : undefined,
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : undefined,
    confirmedBy: row.confirmed_by ? String(row.confirmed_by) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function upsertProjectChecklist(
  checklist: ProjectChecklist,
): Promise<string> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase
    .from('project_checklists')
    .upsert({
      id: checklist.id,
      owner_id: checklist.ownerId,
      project_id: checklist.projectId,
      template_key: checklist.templateKey,
      template_name: checklist.templateName.trim(),
      category: checklist.category,
      inspection_date: checklist.inspectionDate,
      answers: checklist.answers,
      status: checklist.status,
      note: checklist.note?.trim() || null,
      confirmed_at: checklist.confirmedAt ?? null,
      confirmed_by: checklist.confirmedBy ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function listProjectChecklists(
  projectId: string,
): Promise<ProjectChecklist[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('project_checklists')
    .select('*')
    .eq('project_id', projectId)
    .order('inspection_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(checklistFromRow);
}
