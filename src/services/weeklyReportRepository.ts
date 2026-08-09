import type { WeeklyReport, WeeklyReportSnapshot } from '@/domain/types';
import { supabase } from './supabase';

function snapshotFromRow(value: unknown): WeeklyReportSnapshot {
  const source = (value ?? {}) as Record<string, unknown>;
  return {
    generatedAt: String(source.generatedAt ?? source.generated_at ?? ''),
    completedTasks: Array.isArray(source.completedTasks)
      ? (source.completedTasks as WeeklyReportSnapshot['completedTasks'])
      : [],
    diaryEntryCount: Number(source.diaryEntryCount ?? 0),
    workerDays: Number(source.workerDays ?? 0),
    verifiedSpendCents: Number(source.verifiedSpendCents ?? 0),
    acceptedChangeCents: Number(source.acceptedChangeCents ?? 0),
    openTaskCount: Number(source.openTaskCount ?? 0),
    blockedTaskCount: Number(source.blockedTaskCount ?? 0),
    overdueTaskCount: Number(source.overdueTaskCount ?? 0),
    materialRiskCount: Number(source.materialRiskCount ?? 0),
    scheduleRisk:
      (source.scheduleRisk as WeeklyReportSnapshot['scheduleRisk']) ??
      'not_configured',
    forecastCompletionDate: source.forecastCompletionDate
      ? String(source.forecastCompletionDate)
      : undefined,
    attachmentIds: Array.isArray(source.attachmentIds)
      ? source.attachmentIds.map(String)
      : [],
  };
}

function fromRow(row: Record<string, unknown>): WeeklyReport {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    projectId: String(row.project_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    summary: String(row.summary),
    nextWeekPlan: String(row.next_week_plan),
    clientNote: row.client_note ? String(row.client_note) : undefined,
    snapshot: snapshotFromRow(row.snapshot),
    status: row.status as WeeklyReport['status'],
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    pdfReportId: row.pdf_report_id ? String(row.pdf_report_id) : undefined,
    syncStatus: 'synced',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveRemoteWeeklyReport(
  report: WeeklyReport,
): Promise<WeeklyReport> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('save_weekly_report', {
    p_id: report.id,
    p_project_id: report.projectId,
    p_period_start: report.periodStart,
    p_period_end: report.periodEnd,
    p_summary: report.summary,
    p_next_week_plan: report.nextWeekPlan,
    p_client_note: report.clientNote ?? null,
    p_snapshot: report.snapshot,
    p_pdf_report_id: report.pdfReportId ?? null,
    p_publish: report.status === 'published',
    p_confirmed: report.status === 'published',
  });
  if (error) throw error;
  return fromRow(data as Record<string, unknown>);
}

export async function listWeeklyReports(
  projectId: string,
): Promise<WeeklyReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('period_start', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => fromRow(row as Record<string, unknown>));
}
