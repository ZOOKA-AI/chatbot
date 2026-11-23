import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, test } from "vitest";

import { hasSkillTrigger, SkillsConsole } from "@/components/skills-console";

describe("skills console", () => {
  test("recognizes English and Arabic trigger phrases", () => {
    expect(hasSkillTrigger("USE WHEN reviewing code")).toBe(true);
    expect(hasSkillTrigger("استخدم عندما تحتاج إلى مراجعة")).toBe(true);
    expect(hasSkillTrigger("A useful skill")).toBe(false);
  });

  test("localizes the console and hides management controls from members", () => {
    const english = renderToStaticMarkup(createElement(SkillsConsole, { canManage: true, lang: "en" }));
    const arabic = renderToStaticMarkup(createElement(SkillsConsole, { canManage: false, lang: "ar" }));
    expect(english).toContain("Workspace skills");
    expect(english).toContain("New skill");
    expect(arabic).toContain("مهارات مساحة العمل");
    expect(arabic).not.toContain("مهارة جديدة");
  });
});
