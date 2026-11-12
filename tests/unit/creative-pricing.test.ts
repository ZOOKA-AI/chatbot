import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CREATIVE_PACKS,
  CREATIVE_TARGET_MARGIN,
  WEIGHTED_TOKENS_PER_USD,
  priceForUnit,
} from "@/lib/saas/creative-pricing";

describe("creative pricing", () => {
  it("never sells a unit below the 75% margin", () => {
    for (const kind of ["image", "video"] as const) {
      const unit = priceForUnit(kind);
      assert.ok(unit.margin >= CREATIVE_TARGET_MARGIN - 1e-9);
      assert.ok(unit.priceUsd > unit.costUsd);
    }
  });

  it("derives weighted tokens from the price at 68k per dollar", () => {
    const unit = priceForUnit("image");
    assert.equal(
      unit.weightedTokens,
      Math.ceil(unit.priceUsd * WEIGHTED_TOKENS_PER_USD)
    );
    assert.ok(Number.isInteger(unit.weightedTokens));
  });

  it("prices every pack at unit price times units with margin intact", () => {
    for (const pack of CREATIVE_PACKS) {
      const unit = priceForUnit(pack.kind);
      assert.equal(pack.priceUsd, Math.ceil(unit.priceUsd * pack.units * 100) / 100);
      assert.ok(pack.margin >= CREATIVE_TARGET_MARGIN - 1e-9);
    }
  });
});
