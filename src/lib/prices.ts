/**
 * A product's price from its variants' range: "450 MT", or "450 MT – 520 MT" when the
 * variants differ, or "—" when the product has no variants yet. Prices live on variants.
 */
export function formatPriceRange(
  fmt: (n: number) => string,
  min: number | null | undefined,
  max: number | null | undefined
): string {
  if (min === null || min === undefined || max === null || max === undefined) return "—";
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}
