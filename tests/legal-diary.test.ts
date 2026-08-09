import { describe, expect, it } from "vitest";
import {
  normalizeDiaryLegalDetails,
  validateDiaryLegalDetails,
} from "../src/domain/legalDiary";

const valid = {
  workerCount: 3,
  workStartTime: "07:00",
  workEndTime: "16:00",
  workforceRoles: [
    { role: "Murár", count: 2 },
    { role: "Strojník", count: 1 },
  ],
  technicalRecords: [
    {
      id: "technical-1",
      category: "test_measurement" as const,
      description: "Skúška konzistencie betónu vyhovela.",
      reference: " Protokol B-17 ",
    },
  ],
};

describe("structured legal diary fields", () => {
  it("accepts a bounded working shift, exact workforce split and technical record", () => {
    expect(validateDiaryLegalDetails(valid)).toBeUndefined();
    expect(normalizeDiaryLegalDetails(valid)).toMatchObject({
      workforceRoles: [
        { role: "Murár", count: 2 },
        { role: "Strojník", count: 1 },
      ],
      technicalRecords: [{ reference: "Protokol B-17" }],
    });
  });

  it("rejects partial or reversed work time", () => {
    expect(
      validateDiaryLegalDetails({ ...valid, workEndTime: undefined }),
    ).toBe("invalid_work_time");
    expect(
      validateDiaryLegalDetails({
        ...valid,
        workStartTime: "17:00",
        workEndTime: "07:00",
      }),
    ).toBe("invalid_work_time");
  });

  it("requires the role split to equal the daily worker total", () => {
    expect(validateDiaryLegalDetails({ ...valid, workerCount: 4 })).toBe(
      "workforce_total_mismatch",
    );
  });

  it("rejects duplicate roles and malformed technical evidence", () => {
    expect(
      validateDiaryLegalDetails({
        ...valid,
        workforceRoles: [
          { role: "Murár", count: 2 },
          { role: " murár ", count: 1 },
        ],
      }),
    ).toBe("invalid_workforce_roles");
    expect(
      validateDiaryLegalDetails({
        ...valid,
        technicalRecords: [{ ...valid.technicalRecords[0], description: "x" }],
      }),
    ).toBe("invalid_technical_records");
  });
});
