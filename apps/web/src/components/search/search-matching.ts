import type { SearchResult } from '@simmer-mosquito/domain';
import type { WebShellCandidate } from '../app-shell/navigation';

/**
 * Whether a navigation item or an action answers what somebody typed.
 *
 * **Token-wise, not whole-phrase.** A substring test over the joined text never
 * reaches `Create Habitat` from `new hab`, because the phrase is split across
 * the label and the `new` keyword. Every token has to land somewhere in the
 * candidate's text; where it lands does not matter.
 */
export function candidateMatches(candidate: WebShellCandidate, query: string): boolean {
	const tokens = query
		.toLowerCase()
		.split(/\s+/u)
		.filter((token) => token !== '');
	if (tokens.length === 0) {
		return false;
	}

	const haystack = [candidate.label, ...candidate.keywords].join(' ').toLowerCase();
	return tokens.every((token) => haystack.includes(token));
}

/** The candidates one query reaches, in navigation order. */
export function matchCandidates(
	candidates: readonly WebShellCandidate[],
	query: string,
): readonly WebShellCandidate[] {
	return candidates.filter((candidate) => candidateMatches(candidate, query));
}

/**
 * The four groups the palette draws, in fixed order.
 *
 * Navigation and verbs sit above records because they are the answers a person
 * can predict: somebody typing `hab` who wanted the Habitats page should not
 * read past nine habitats to find it, and the set of pages and actions is small
 * and fixed.
 */
export interface PaletteGroups {
	readonly pages: readonly SearchResult[];
	readonly actions: readonly SearchResult[];
	readonly records: readonly SearchResult[];
	readonly comments: readonly SearchResult[];
}

/** The ten rows the palette has room for. */
const PALETTE_ROW_BUDGET = 10;

/**
 * The per-group cap, and the order groups give up slots they cannot fill.
 *
 * This exists because class-first ordering starves a whole kind. `elm` returns
 * sixteen indexed hits and fills all ten slots with records, so the Comments
 * heading never appears at all: every comment matches on `comment_text`, which
 * is prose, so a comment can only ever land in the weakest class.
 *
 * The fix goes in the client because "ten rows split four ways" is a property of
 * a 380px dropdown and not of the corpus, and a server that interleaved would be
 * shaping its answer around a UI it cannot see.
 */
const GROUP_CAPS = [
	{ key: 'pages', cap: 2 },
	{ key: 'actions', cap: 2 },
	{ key: 'records', cap: 4 },
	{ key: 'comments', cap: 2 },
] as const;

/** Which group takes a slot another one could not fill. */
const REDISTRIBUTE_ORDER = ['records', 'comments', 'pages', 'actions'] as const;

/**
 * The ten rows, chosen out of the four full lists.
 *
 * The endpoint emits one honest order and the palette re-selects from it, which
 * has a consequence worth stating in review: **the palette's ten and the results
 * page's first ten are not the same rows.** That is why the last row reads "View
 * all results" and never "View all 47 results", which would imply the ten above
 * it are the top ten.
 */
export function capPaletteGroups(groups: PaletteGroups): PaletteGroups {
	const taken: Record<string, number> = {};
	let used = 0;

	for (const { key, cap } of GROUP_CAPS) {
		const count = Math.min(cap, groups[key].length);
		taken[key] = count;
		used += count;
	}

	// A group that cannot fill its cap gives its slots up, in a fixed order, to a
	// group that has more to show.
	for (const key of REDISTRIBUTE_ORDER) {
		if (used >= PALETTE_ROW_BUDGET) {
			break;
		}

		const available = groups[key].length - (taken[key] ?? 0);
		const extra = Math.min(available, PALETTE_ROW_BUDGET - used);
		taken[key] = (taken[key] ?? 0) + extra;
		used += extra;
	}

	return {
		pages: groups.pages.slice(0, taken.pages ?? 0),
		actions: groups.actions.slice(0, taken.actions ?? 0),
		records: groups.records.slice(0, taken.records ?? 0),
		comments: groups.comments.slice(0, taken.comments ?? 0),
	};
}

/**
 * Splits the endpoint's flat list into the two server groups, keeping its order.
 *
 * The list is flat on the wire because a grouped envelope would carry two of
 * four groups: routes and actions never reach the server.
 */
export function bucketServerResults(results: readonly SearchResult[]): {
	readonly records: readonly SearchResult[];
	readonly comments: readonly SearchResult[];
} {
	return {
		records: results.filter((result) => result.kind === 'record'),
		comments: results.filter((result) => result.kind === 'comment'),
	};
}
