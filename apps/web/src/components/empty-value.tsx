/**
 * The em dash that stands in for a value a record does not carry.
 *
 * Tables used to spell the absence out — "No method recorded", "No description",
 * "Not recorded" — which put a sentence in a cell whose job was one word, and
 * spread the same idea across half a dozen phrasings. A dash reads as "nothing
 * here" instantly and in every column.
 *
 * Reserve it for tabular and list contexts. Where a record's own page explains
 * *why* something is missing, say that instead.
 */
export function EmptyValue() {
	return (
		<span className="text-muted-foreground" role="img" title="Not recorded">
			—
		</span>
	);
}
