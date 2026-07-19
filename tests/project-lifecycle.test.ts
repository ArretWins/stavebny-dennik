import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const auth = readFileSync('src/state/auth.tsx', 'utf8');
const projects = readFileSync('src/screens/ProjectsScreen.tsx', 'utf8');
const repository = readFileSync('src/services/repositories.ts', 'utf8');
const appState = readFileSync('src/state/app.tsx', 'utf8');
const exportCascade = readFileSync('supabase/migrations/202607180003_project_delete_with_exports.sql', 'utf8');
const receiptCascade = readFileSync('supabase/migrations/202607180004_receipt_export_project_cascade.sql', 'utf8');
const splitGuards = readFileSync('supabase/migrations/202607180005_split_export_guards.sql', 'utf8');

describe('project lifecycle safeguards', () => {
  it('does not create an authenticated app state before email confirmation', () => {
    expect(auth).toContain("if (!data.session) return 'confirmation_required'");
    expect(auth).toContain('data.session.user.id');
  });

  it('isolates cached data by authenticated user', () => {
    expect(appState).toContain('hydratedRaw.activeUserId === userId');
    expect(appState).toContain('projects: remoteProjects');
  });

  it('requires confirmation and removes project data and private files', () => {
    expect(projects).toContain("style: 'destructive'");
    expect(projects).toContain('deleteRemoteProject(projectId)');
    expect(repository).toContain("from('projects').delete()");
    for (const bucket of ['attachments', 'receipts', 'reports']) {
      expect(repository).toContain(`storage.from('${bucket}').remove`);
    }
  });

  it('keeps direct export changes blocked but permits project cascades', () => {
    expect(exportCascade).toContain("tg_table_name='receipt_export_batches'");
    expect(exportCascade).toContain('not exists(select 1 from public.projects');
    expect(exportCascade).toContain("raise exception 'IMMUTABLE_RECEIPT_EXPORT'");
    expect(receiptCascade).toContain('references public.receipts(id) on delete cascade');
    expect(receiptCascade).toContain('not exists(select 1 from public.projects where id=batch.project_id)');
    expect(splitGuards).toContain('guard_immutable_receipt_export_batch');
    expect(splitGuards).toContain('guard_immutable_receipt_export_item');
  });
});
