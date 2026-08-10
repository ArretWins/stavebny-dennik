import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("simplified application navigation", () => {
  it("does not expose the six removed sections", () => {
    const app = readFileSync("App.tsx", "utf8");
    const today = readFileSync("src/screens/TodayScreen.tsx", "utf8");

    for (const route of [
      "Checklists",
      "ChangeOrders",
      "FinancialControl",
      "ScheduleForecast",
      "DailyControlPlan",
      "Tools",
    ]) {
      expect(app).not.toContain('<Stack.Screen name="' + route + '"');
      expect(today).not.toContain('navigation.navigate("' + route + '")');
    }

    expect(today).not.toContain('t("dayClosure.title")');
  });
});
