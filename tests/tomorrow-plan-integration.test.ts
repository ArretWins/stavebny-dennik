import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tomorrow plan integration", () => {
  it("is reachable from the dashboard and task register", () => {
    const app = readFileSync("App.tsx", "utf8");
    const today = readFileSync("src/screens/TodayScreen.tsx", "utf8");
    const tasks = readFileSync("src/screens/TasksScreen.tsx", "utf8");
    expect(app).toContain('name="TomorrowPlan"');
    expect(app).toContain("component={TomorrowPlanScreen}");
    expect(today).toContain('navigation.navigate("TomorrowPlan")');
    expect(tasks).toContain('navigation.navigate("TomorrowPlan")');
  });

  it("offers direct fixes for the readiness checks that remain enabled", () => {
    const screen = readFileSync("src/screens/TomorrowPlanScreen.tsx", "utf8");
    expect(screen).toContain('task_blocked: "TaskEditor"');
    expect(screen).toContain('credential_invalid: "WorkerCredentials"');
    expect(screen).toContain('materials_shortage: "TaskMaterials"');
    expect(screen).toContain("toolRequirements: []");
    expect(screen).not.toContain('navigation.navigate("Tools")');
    expect(screen).not.toContain('navigation.navigate("TaskTools")');
    expect(screen).toContain('safety_unplanned: "SafetyBriefings"');
  });
});
