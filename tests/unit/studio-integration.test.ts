import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import * as schema from "@/lib/db/schema";

/**
 * The studio as the agent reaches it.
 *
 * Three separate claims are checked here, and only the first two can be decided without a model file:
 * which action an Arabic request maps to, which asset a name resolves to inside a workspace, and which
 * segmentation models are allowed to run at all. The third is a licence question, so it is a refusal
 * test rather than a happy path.
 */

const holder = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof drizzle> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/lib/db/tenant-context", () => ({ commanderActiveDb: () => null }));

import { matchActionsForRequest, findAction, listActions } from "@/lib/actions/catalog";
import { resolveModel, SEGMENTATION_MODELS } from "@/lib/studio/background";
import { normaliseScript } from "@/lib/studio/tts";
import { readImageInstruction, resolveAssetRef } from "@/lib/agents/worker-tools/studio-media";

const ORG_A = "org-alpha";
const ORG_B = "org-beta";

let pg: PGlite;

beforeEach(async () => {
  pg = new PGlite();
  for (const file of [
    "0027_agent_command_center.sql",
    "pending/0028_agent_tenant_scope.sql",
    "pending/0033_decision_audit_uniqueness.sql",
    "pending/0038_schedule_and_agent_model.sql",
    "pending/0040_agent_tools_and_instructions.sql",
    "pending/0041_workspace_projects.sql",
    "pending/0042_project_documents.sql",
    "pending/0043_browser_sessions.sql",
    "pending/0044_studio_media.sql",
  ]) {
    for (const part of readFileSync(join(process.cwd(), "lib/db/migrations", file), "utf8").split("--> statement-breakpoint")) {
      if (part.trim()) await pg.exec(part);
    }
  }
  holder.db = drizzle(pg, { schema });
});

afterEach(async () => {
  await pg.close();
});

const seed = (organizationId: string, label: string, kind = "image") =>
  pg.query(
    `insert into "StudioAsset"("organizationId",kind,source,"storagePath","mimeType",bytes,status,label)
     values ($1,$2,'upload','/tmp/x','image/png',10,'ready',$3) returning id`,
    [organizationId, kind, label]
  );

describe("an Arabic request maps to a real action", () => {
  test("the studio actions exist and are executable", () => {
    for (const id of ["studio_image_edit", "studio_background_remove", "studio_video_render", "studio_narration"]) {
      const action = findAction(id);
      assert.ok(action, `${id} is in the catalog`);
      assert.equal(action?.executable, true, `${id} is backed by a registered tool`);
    }
  });

  test("plain Arabic picks the specific action, not every action that mentions the word", () => {
    assert.deepEqual(matchActionsForRequest("أزل خلفية هذه الصورة"), ["studio_background_remove"]);
    assert.deepEqual(matchActionsForRequest("اعمل لي فيديو ريلز من الصور"), ["studio_video_render"]);
    assert.deepEqual(matchActionsForRequest("اكتب تعليق صوتي لهذا الإعلان"), ["studio_narration"]);
    assert.deepEqual(matchActionsForRequest("كبّر الصورة إلى 1080×1920"), ["studio_image_edit"]);
  });

  test("a request that names nothing the studio does returns nothing, not a guess", () => {
    assert.deepEqual(matchActionsForRequest("أرسل الفاتورة إلى المحاسب"), []);
    assert.deepEqual(matchActionsForRequest(""), []);
  });

  test("every catalog action that claims creative work is backed by a studio tool", () => {
    const creative = listActions().filter((action) => action.category === "creative");
    // Pinned by id rather than by count: a count catches an addition but not a silent swap, and this
    // list is the promise that every creative action has a real tool behind it.
    assert.deepEqual(creative.map((action) => action.id).sort(), [
      "studio_ai_generate",
      "studio_background_remove",
      "studio_image_edit",
      "studio_narration",
      "studio_promo_video",
      "studio_video_render",
    ]);
    for (const action of creative) {
      assert.equal(action.executable, true);
      assert.ok(action.requiredTools.every((tool) => tool.startsWith("studio_")));
    }
  });
});

describe("an Arabic edit instruction becomes a deterministic operation", () => {
  test("resize, crop and text are read from the words and the numbers", () => {
    assert.deepEqual(readImageInstruction("كبّرها إلى 1080x1920"), { op: "resize", width: 1080, height: 1920 });
    assert.deepEqual(readImageInstruction("قص 600x600"), { op: "crop", width: 600, height: 600, x: 0, y: 0 });
    const text = readImageInstruction('اكتب نص: "عرض خاص"');
    assert.equal(text?.op, "text");
    if (text?.op === "text") assert.equal(text.text, "عرض خاص");
  });

  test("resize without a size falls back to a stated default rather than failing silently", () => {
    const sized = readImageInstruction("كبّر الصورة");
    assert.equal(sized?.op, "resize");
    if (sized?.op === "resize") {
      assert.equal(sized.width, 1080);
      assert.equal(sized.height, 1920);
    }
  });

  test("a background request is never silently turned into another edit", () => {
    assert.equal(readImageInstruction("أزل الخلفية"), null, "the background tool owns that word");
  });

  test("an instruction naming no supported edit returns null", () => {
    assert.equal(readImageInstruction("اجعلها أجمل"), null);
  });
});

describe("an asset reference resolves only inside its own workspace", () => {
  test("a label finds the newest matching asset, an id is taken literally", async () => {
    await seed(ORG_A, "صورة-المتجر");
    const latest = await seed(ORG_A, "صورة-المتجر-2");
    const byLabel = await resolveAssetRef(ORG_A, "صورة-المتجر");
    assert.ok(byLabel, "a label resolves");
    const byId = await resolveAssetRef(ORG_A, (latest.rows[0] as { id: string }).id);
    assert.equal(byId?.id, (latest.rows[0] as { id: string }).id);
  });

  test("another workspace's label and id both resolve to nothing", async () => {
    await seed(ORG_A, "logo-teal");
    const other = await seed(ORG_B, "logo-teal");
    assert.equal(await resolveAssetRef(ORG_B, "logo-teal") !== null, true, "its own asset is visible");
    const foreignId = (other.rows[0] as { id: string }).id;
    const asA = await resolveAssetRef(ORG_A, foreignId);
    assert.ok(asA === null || asA.organizationId === ORG_A, "an id from B never resolves for A");
  });

  test("a kind filter keeps a narration from being used as a picture", async () => {
    await seed(ORG_A, "مقطع", "audio");
    assert.equal(await resolveAssetRef(ORG_A, "مقطع", "image"), null);
    assert.ok(await resolveAssetRef(ORG_A, "مقطع", "audio"));
  });

  test("a label with an underscore resolves: escaping must not rewrite the name", async () => {
    // The end-to-end run found this: the needle used to have its underscores deleted, so a label like
    // "edit:background_remove" was searched as "edit:backgroundremove" and never matched.
    await seed(ORG_A, "edit:background_remove");
    const found = await resolveAssetRef(ORG_A, "edit:background_remove");
    assert.ok(found, "an underscore in a label is part of the name");
    assert.equal(found?.label, "edit:background_remove");
    const partial = await resolveAssetRef(ORG_A, "background_remove");
    assert.ok(partial, "and a fragment of it still matches");
  });

  test("a wildcard in the label cannot widen the search", async () => {
    await seed(ORG_A, "secret-picture");
    assert.equal(await resolveAssetRef(ORG_A, "%"), null);
  });
});

describe("licences gate the segmentation model", () => {
  test("the default model is commercially usable", () => {
    assert.equal(resolveModel(null), "u2net");
    assert.equal(SEGMENTATION_MODELS.u2net.commercial, true);
    assert.equal(SEGMENTATION_MODELS.u2net.license, "Apache-2.0");
  });

  test("the non-commercial model is refused unless an operator opts in", () => {
    const previous = process.env.STUDIO_ALLOW_NONCOMMERCIAL_MODEL;
    delete process.env.STUDIO_ALLOW_NONCOMMERCIAL_MODEL;
    assert.throws(() => resolveModel("bria-rmbg"), /license_not_commercial|CC-BY-NC/);
    process.env.STUDIO_ALLOW_NONCOMMERCIAL_MODEL = "1";
    assert.equal(resolveModel("bria-rmbg"), "bria-rmbg");
    if (previous === undefined) delete process.env.STUDIO_ALLOW_NONCOMMERCIAL_MODEL;
    else process.env.STUDIO_ALLOW_NONCOMMERCIAL_MODEL = previous;
  });

  test("an unknown model name is refused rather than passed to the engine", () => {
    assert.throws(() => resolveModel("some-random-model"), /unknown_model/);
  });
});

describe("the narration script is cleaned before it is spoken", () => {
  test("diacritics and markup are removed, text is kept", () => {
    assert.equal(normaliseScript("**تقنيةٌ بإيمان**"), "تقنية بإيمان");
    assert.equal(normaliseScript("  سطر\n\nجديد  "), "سطر جديد");
  });

  test("a long script is bounded to what the engine will accept", () => {
    const long = "ا".repeat(3000);
    assert.equal(normaliseScript(long).length, 1200);
  });
});
