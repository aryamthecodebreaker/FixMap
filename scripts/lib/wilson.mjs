// Wilson score interval, shared by every evaluation script so that a published rate and
// its stated precision can never come from two different formulas.
//
// Used rather than the normal approximation because that one misbehaves near 0 and 1,
// which is exactly where a perfect result sits.

/**
 * @param {number} successes
 * @param {number} total
 * @param {number} [z] 1.96 for a 95% interval
 * @returns {[number, number] | null} null when there is nothing to measure
 */
export function wilsonInterval(successes, total, z = 1.96) {
  if (total === 0) {
    return null;
  }
  const proportion = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = proportion + (z * z) / (2 * total);
  const spread = z * Math.sqrt((proportion * (1 - proportion)) / total + (z * z) / (4 * total * total));
  return [
    Number(Math.max(0, (centre - spread) / denominator).toFixed(3)),
    Number(Math.min(1, (centre + spread) / denominator).toFixed(3))
  ];
}
