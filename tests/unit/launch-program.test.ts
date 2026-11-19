import { describe, expect, it } from "vitest";
import { LAUNCH_PROGRAM_SLOTS, isLaunchProgramOpen } from "@/lib/billing/launch-program";

describe("launch testing program", () => {
  it("allocates exactly twenty slots", () => {
    expect(LAUNCH_PROGRAM_SLOTS).toBe(20);
  });

  it("is closed unless the switch reads exactly on", () => {
    expect(isLaunchProgramOpen({ LAUNCH_TESTING_PROGRAM: "on" })).toBe(true);
    expect(isLaunchProgramOpen({ LAUNCH_TESTING_PROGRAM: " ON " })).toBe(true);
    expect(isLaunchProgramOpen({ LAUNCH_TESTING_PROGRAM: "off" })).toBe(false);
    expect(isLaunchProgramOpen({ LAUNCH_TESTING_PROGRAM: "yes" })).toBe(false);
    expect(isLaunchProgramOpen({})).toBe(false);
  });
});
