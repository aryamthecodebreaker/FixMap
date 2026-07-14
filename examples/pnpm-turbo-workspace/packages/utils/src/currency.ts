export function applyDiscount(total: number, percent: number): number {
  const discounted = total * (1 - percent / 100);
  return roundToCents(discounted);
}

export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
