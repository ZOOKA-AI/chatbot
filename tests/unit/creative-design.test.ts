import { expect, test } from "vitest";
import {
  categoryNames,
  designSchema,
  designSvg,
  loadDesigns,
  newLayer,
  templateDesign,
} from "@/lib/creative/design";
import { imageOptionsSchema, imagePrompt } from "@/lib/creative/image-options";

test("all shipped template categories are actual editable designs and safe SVG previews", () => {
  for (let i = 0; i < categoryNames.length; i++) {
    const design = templateDesign(i);
    expect(designSchema.safeParse(design).success).toBe(true);
    expect(designSvg(design)).toContain("<svg");
    expect(design.layers.length).toBeGreaterThan(0);
  }
});
test("SVG never interpolates raw text as markup and rejects active/external image sources", () => {
  const design = templateDesign(0);
  design.layers[1].text = '<script>alert("x")</script>&';
  const svg = designSvg(design);
  expect(svg).not.toContain("<script>");
  expect(svg).toContain("&lt;script&gt;");
  for (const source of [
    "javascript:alert(1)",
    "https://remote.test/pixel.png",
    "data:image/svg+xml,<svg onload='alert(1)'/>",
  ]) {
    expect(
      designSchema.safeParse({
        ...design,
        layers: [{ ...newLayer("image", "image"), source }],
      }).success
    ).toBe(false);
  }
});
test("imports enforce numeric bounds, unique ids, shape types and library size", () => {
  const design = templateDesign(0);
  expect(loadDesigns("broken")).toEqual([]);
  expect(loadDesigns(JSON.stringify([design]))).toHaveLength(1);
  expect(loadDesigns(JSON.stringify(new Array(13).fill(design)))).toEqual([]);
  expect(designSchema.safeParse({ ...design, width: 999_999 }).success).toBe(
    false
  );
  expect(
    designSchema.safeParse({
      ...design,
      layers: [design.layers[0], design.layers[0]],
    }).success
  ).toBe(false);
});
test("image settings accept supported ratios and bounded references, not model override or remote URL", () => {
  const settings = imageOptionsSchema.parse({
    ratio: "9:16",
    style: "3d-look",
    text: "زوكا",
  });
  expect(imagePrompt("A product", settings)).toContain("3d-look");
  expect(
    imageOptionsSchema.safeParse({ model: "unbounded-provider" }).success
  ).toBe(false);
  expect(
    imageOptionsSchema.safeParse({ reference: "https://remote.test/image" })
      .success
  ).toBe(false);
  expect(imageOptionsSchema.safeParse({ ratio: "100:1" }).success).toBe(false);
});
