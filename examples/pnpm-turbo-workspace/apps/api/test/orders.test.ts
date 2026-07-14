import { expect, it } from "vitest";
import { orderTotal } from "../src/orders.js";

it("applies the SAVE10 discount code", () => {
  expect(orderTotal({ total: 20, discountCode: "SAVE10" })).toBe(18);
});

it("charges the full total without a discount code", () => {
  expect(orderTotal({ total: 20 })).toBe(20);
});
