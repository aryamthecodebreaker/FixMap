import { expect, it } from "vitest";
import { applyDiscount, roundToCents } from "../src/currency.js";

it("applies a percentage discount", () => {
  expect(applyDiscount(20, 10)).toBe(18);
});

it("rounds amounts to whole cents", () => {
  expect(roundToCents(17.999)).toBe(18);
});
