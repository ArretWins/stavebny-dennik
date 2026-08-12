import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("removed planning workflow", () => {
  it("is no longer reachable from the application", () => {
    const app = readFileSync("App.tsx", "utf8");
    const today = readFileSync("src/screens/TodayScreen.tsx", "utf8");
    const reports = readFileSync("src/screens/ReportsScreen.tsx", "utf8");

    for (const route of ["Plans", "Tasks", "TomorrowPlan", "WeeklyReport"]) {
      expect(app).not.toContain(`name="${route}"`);
      expect(today).not.toContain(`navigation.navigate("${route}")`);
    }
    expect(reports).not.toContain("weeklyReport.open");
  });
});
