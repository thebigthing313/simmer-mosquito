import { type CountNoun, countLabel, formatCount } from '../../lib/format-count';
/**
 * The count beside an explorer's title.
 *
 * Nine explorers each carried a private copy of this, identical apart from the
 * noun, which is how the "Loading…" branch and the singular/plural fork had to
 * be got right nine times.
 */
export function ResultMeta({
	total,
	isLoading,
	noun,
}: {
	readonly total: number;
	readonly isLoading: boolean;
	/**
	 * Singular and plural forms of what is being counted. Omitted on all nine
	 * paged explorers, which list what the viewport holds rather than a set of
	 * records and read "n in view" (#920). A noun is what the surfaces that page
	 * by something other than a box still pass: the trap directory, a Profile's
	 * day of work, and the explorers that hold their whole set at once.
	 */
	readonly noun?: CountNoun | undefined;
}) {
	if (isLoading && total === 0) {
		return <span className="whitespace-nowrap text-muted-foreground text-sm">Loading…</span>;
	}
	return (
		<span className="whitespace-nowrap text-muted-foreground text-sm">
			{resultLabel(total, noun)}
		</span>
	);
}

function resultLabel(total: number, noun: CountNoun | undefined): string {
	if (noun === undefined) {
		return total === 0 ? 'None in view' : `${formatCount(total)} in view`;
	}
	return countLabel(total, noun);
}
