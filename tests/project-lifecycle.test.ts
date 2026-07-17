import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const auth = readFileSync('src/state/auth.tsx', 'utf8');
const projects = readFileSync('src/screens/ProjectsScreen.tsx', 'utf8');
const repository = readFileSync('src/services/repositories.ts', 'utf8');
const appState = readFileSync('src/state/app.tsx', 'utf8');

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
});
