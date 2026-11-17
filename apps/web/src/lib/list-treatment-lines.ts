/**
 * A Treatment's products as a row lists them: one part per line, in line
 * order, comma-joined. A row draws its names and its amounts through this, so
 * the two lists read in the same order (ADR 0020).
 *
 * Its own module rather than beside `formatMeasure` in `control-display.tsx`,
 * because the habitat history tabs import it beside `lib/format-count`, and a
 * module importing both of those is what `fallow dead-code` reports as a
 * duplicate `formatAmount` export.
 */
export function listTreatmentLines<TLine>(
	lines: readonly TLine[],
	part: (line: TLine) => string,
): string {
	return lines.map(part).join(', ');
}
