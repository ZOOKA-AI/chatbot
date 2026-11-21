import { describe, expect, test } from "vitest";

import { belongsToOtherProject } from "../../lib/integrations/project-isolation";

describe("workspace project isolation", () => {
  test("the other business's connected assets are recognised", () => {
    const royal = [
      { displayName: "شركة تنظيف في الإمارات - رويال هارون", accountEmail: null },
      { displayName: "@royal_cleaning_uae", accountEmail: null },
      { displayName: "royalharoon.com email routing", accountEmail: null },
      { displayName: null, accountEmail: "info@royalharoon.com" },
      { displayName: "شرك رويال هارون لخدمات التنظيف", accountEmail: null },
    ];
    for (const connection of royal) {
      expect(belongsToOtherProject(connection)).toBe(true);
    }
  });

  test("the payment connection stays visible even though its entity is the other business", () => {
    expect(
      belongsToOtherProject({
        displayName: "Royal Haroon Cleaning FZ-LLC",
        accountEmail: "info@royalharoon.com",
        providerId: "stripe",
      })
    ).toBe(false);
  });

  test("this workspace's own assets are kept", () => {
    const zooka = [
      { displayName: "ZOOKA AI", accountEmail: null },
      { displayName: "ZOOKA-AI Project", accountEmail: "info@zooka-ai.com" },
      { displayName: "Helmy Ali", accountEmail: null },
      { displayName: "n8n Automation", accountEmail: null },
      { displayName: null, accountEmail: null },
    ];
    for (const connection of zooka) {
      expect(belongsToOtherProject(connection)).toBe(false);
    }
  });
});
