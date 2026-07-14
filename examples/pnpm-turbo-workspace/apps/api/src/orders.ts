import { applyDiscount } from "@example/utils";

export type Order = {
  total: number;
  discountCode?: string;
};

export function orderTotal(order: Order): number {
  if (order.discountCode === "SAVE10") {
    return applyDiscount(order.total, 10);
  }
  return order.total;
}
