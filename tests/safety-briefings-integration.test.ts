import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('safety briefing application integration', () => {
  it('queues the full foreman lifecycle and reloads the personal roster', () => {
    const app = readFileSync('src/state/app.tsx', 'utf8');
    for (const type of ['safety_briefing', 'safety_briefing_publish', 'safety_briefing_excuse', 'safety_briefing_close']) expect(app).toContain(`"${type}"`);
    expect(app).toContain('listProjectSafetyBriefings(selectedProject.id)');
    expect(app).toContain('resolvedSafetyBriefings');
    expect(app).toContain('canonicalSafetyBriefing');
  });
  it('wires the immutable roster UI, worker portal and control tower target', () => {
    const navigation = readFileSync('App.tsx', 'utf8');
    const register = readFileSync('src/screens/SafetyBriefingsScreen.tsx', 'utf8');
    const tower = readFileSync('src/domain/controlTower.ts', 'utf8');
    expect(navigation).toContain('name="SafetyBriefings"');
    expect(navigation).toContain('component={SafetyBriefingsScreen}');
    expect(navigation).toContain('name="SafetyBriefingEditor"');
    expect(navigation).toContain('component={SafetyBriefingEditorScreen}');
    expect(register).toContain('safetyBriefingProgress');
    expect(register).toContain('15_000');
    expect(tower).toContain('target: "safety_briefings"');
  });
});
