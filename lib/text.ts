/**
 * Copy helpers for counted things.
 *
 * Here rather than inside a dialog because three delete confirmations need the
 * same sentence with different nouns, and Spanish pluralisation plus the "a, b
 * y c" join are the kind of small rule that ends up written slightly
 * differently in each copy.
 */

/** One term of the phrase, or null when there is nothing to mention. */
type Counted = [count: number, singular: string, plural: string];

/**
 * "3 proyectos, 12 diseños y 47 imágenes".
 *
 * Terms that count zero are dropped rather than printed as "0 diseños": a
 * warning should list what is lost, not pad itself with what is not. Returns
 * null when everything is zero, so the caller writes that case in its own
 * words instead of showing an empty sentence.
 */
export function countPhrase(terms: Counted[]): string | null {
  const parts = terms
    .filter(([count]) => count > 0)
    .map(([count, singular, plural]) =>
      `${count} ${count === 1 ? singular : plural}`
    );

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}
