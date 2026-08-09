import type { ProjectBudget } from '@/domain/types';
import { supabase } from './supabase';

function fromRow(row: Record<string, unknown>): ProjectBudget {
  return {
    projectId: String(row.project_id),
    ownerId: String(row.owner_id),
    baselineBudgetCents: Number(row.baseline_budget_cents),
    contingencyCents: Number(row.contingency_cents),
    remainingCommitmentCents: Number(row.remaining_commitment_cents ?? 0),
    note: row.note ? String(row.note) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveRemoteProjectBudget(
  budget: ProjectBudget,
): Promise<ProjectBudget> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase
    .from('project_budgets')
    .upsert(
      {
        project_id: budget.projectId,
        owner_id: budget.ownerId,
        baseline_budget_cents: budget.baselineBudgetCents,
        contingency_cents: budget.contingencyCents,
        remaining_commitment_cents: budget.remainingCommitmentCents,
        note: budget.note?.trim() || null,
      },
      { onConflict: 'project_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}

export async function getProjectBudget(
  projectId: string,
): Promise<ProjectBudget | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from('project_budgets')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as Record<string, unknown>) : undefined;
}
