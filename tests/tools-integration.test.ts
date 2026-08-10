import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('tool register application integration', () => {
  it('wires every custody transition through the offline outbox', () => {
    const appState = readFileSync('src/state/app.tsx', 'utf8');
    for (const type of [
      'project_tool',
      'project_tool_issue',
      'project_tool_return',
      'project_tool_problem',
      'project_tool_restore',
      'project_tool_retire',
    ]) {
      expect(appState).toContain(`\"${type}\"`);
    }
    expect(appState).toContain('listProjectTools(selectedProject.id)');
    expect(appState).toContain('resolvedProjectTools');
  });

  it('keeps existing tool records intact without exposing the removed interface', () => {
    const navigation = readFileSync('App.tsx', 'utf8');
    const editor = readFileSync('src/screens/ToolEditorScreen.tsx', 'utf8');
    const register = readFileSync('src/screens/ToolsScreen.tsx', 'utf8');
    expect(navigation).not.toContain('ToolEditor: \"tools/:toolId\"');
    expect(navigation).not.toContain('<Stack.Screen name=\"Tools\"');
    expect(editor).toContain('projectToolQrValue(existing.id)');
    expect(editor).toContain('issueProjectTool');
    expect(editor).toContain('returnProjectTool');
    expect(editor).toContain('reportProjectToolIssue');
    expect(editor).toContain('restoreProjectTool');
    expect(editor).toContain('retireProjectTool');
    expect(register).toContain('isProjectToolOverdue');
  });
});
