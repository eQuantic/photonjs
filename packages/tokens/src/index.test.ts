import { expect, test } from "bun:test";
import { Elevation, Radius, Space, Typography, dark, light } from "./index";
import type { ColorVariant } from "./colors";

test("cada esquema tem variantes interativas com os 5 sub-tokens", () => {
  for (const scheme of [light, dark]) {
    const variants: ColorVariant[] = [
      scheme.primary,
      scheme.secondary,
      scheme.destructive,
      scheme.success,
      scheme.warning,
      scheme.info,
    ];
    for (const v of variants) {
      for (const sub of [v.base, v.onBase, v.pressed, v.subtle, v.onSubtle]) {
        expect(sub).toMatch(/^(#|rgb)/);
      }
    }
  }
});

test("escalas e papéis tipográficos batem com o design system", () => {
  expect(Space.S4).toBe(16);
  expect(Radius.Md).toBe(10);
  expect(Elevation.E1?.blur).toBe(3);
  expect(Elevation.E0).toBeNull();
  expect(Typography.title.size).toBe(20);
  expect(Typography.display.weight).toBe(800);
});
