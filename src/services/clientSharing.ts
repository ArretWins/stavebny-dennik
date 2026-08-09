import type {
  CreatedProjectShareLink,
  ProjectShareLink,
} from '@/domain/types';
import { supabase } from './supabase';

function linkFromRow(row: Record<string, unknown>): ProjectShareLink {
  return {
    id: String(row.id),
    projectId: String(row.project_id ?? row.projectId),
    expiresAt: String(row.expires_at ?? row.expiresAt),
    revokedAt: row.revoked_at ?? row.revokedAt
      ? String(row.revoked_at ?? row.revokedAt)
      : undefined,
    viewCount: Number(row.view_count ?? row.viewCount ?? 0),
    lastViewedAt: row.last_viewed_at ?? row.lastViewedAt
      ? String(row.last_viewed_at ?? row.lastViewedAt)
      : undefined,
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

export async function listProjectShareLinks(
  projectId: string,
): Promise<ProjectShareLink[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('project_share_links')
    .select(
      'id,project_id,expires_at,revoked_at,view_count,last_viewed_at,created_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linkFromRow);
}

export async function createProjectShareLink(
  projectId: string,
  expiresHours: number,
): Promise<CreatedProjectShareLink> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await supabase.rpc('create_project_share_link', {
    p_project_id: projectId,
    p_expires_hours: expiresHours,
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  const token = String(row.token);
  const workerPortal = process.env.EXPO_PUBLIC_WORKER_PORTAL_URL?.replace(
    /\/+$/,
    '',
  );
  const base =
    process.env.EXPO_PUBLIC_CLIENT_SHARE_URL ||
    (workerPortal
      ? `${workerPortal}/client-share`
      : `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/project-share`);
  return {
    ...linkFromRow({
      ...row,
      view_count: 0,
    }),
    token,
    url: `${base}?token=${encodeURIComponent(token)}`,
  };
}

export async function revokeProjectShareLink(linkId: string): Promise<void> {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { error } = await supabase.rpc('revoke_project_share_link', {
    p_link_id: linkId,
  });
  if (error) throw error;
}
