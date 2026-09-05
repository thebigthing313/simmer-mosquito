import type { CommentTargetType } from '../field-work/shared.js';

/**
 * The shortest query the search endpoint accepts.
 *
 * One character, not three. The organization's handles are codes on a shared
 * template (`MID - S2 - 139`, `TRP-1213-026`), so a single digit is a real
 * search here and a floor of three would refuse it. Stated once, beside the
 * type, because the palette guards on it and the endpoint refuses on it and two
 * copies drift.
 */
export const SEARCH_QUERY_MIN_LENGTH = 1;

/**
 * The longest query the endpoint accepts, above which it refuses rather than
 * truncating. A silently truncated query answers a phrase the person did not
 * type. The palette's input carries the same number as `maxLength`, so the
 * refusal only ever answers a caller that went around it.
 */
export const SEARCH_QUERY_MAX_LENGTH = 200;

/** The largest page `GET /search` will answer with. */
export const SEARCH_MAX_LIMIT = 100;

/**
 * The furthest into a result set the endpoint will page.
 *
 * Stated here beside the length bounds and for the same reason: the results
 * page has to stop growing its list at the same number the server refuses at,
 * or infinite scroll walks off the end into a run of 400s.
 */
export const SEARCH_MAX_OFFSET = 1000;

/**
 * The tables whose rows the search index holds, in the order ties break in.
 *
 * A table is in the corpus when it holds a handle the organization itself typed
 * and has a detail route. Both halves are checkable rather than a judgement
 * call: `pnpm check:search-corpus` reads this list against the corpus
 * declaration in `packages/db` and the triggers the migration creates.
 *
 * The order is load-bearing. Two documents in the same match class with the same
 * score are ordered by their table's position here and then by id, which is what
 * makes the same query twice return the same list.
 */
export const CORPUS_TABLES = [
	'habitats',
	'traps',
	'service_requests',
	'contacts',
	'addresses',
	'regions',
	'routes',
	'assignments',
	'missions',
	'requested_control_actions',
	'samples',
	'weather_sources',
] as const;

export type CorpusTable = (typeof CORPUS_TABLES)[number];

/**
 * Every document class the index holds: the twelve record tables plus comments.
 *
 * `comments` sits in the same string space as the record tables because a
 * document's class *is* its source table, and a second concept beside the table
 * name would be a second thing to keep in step.
 */
export type SearchDocumentTable = CorpusTable | 'comments';

/**
 * How a document matched, best class first.
 *
 * One class per document, never one per field: the class is the best any of the
 * document's fields reached. Nothing compares across classes, because ranking
 * functions carry no global information and two scores from different branches
 * are not a comparison at all.
 */
export type SearchMatchClass = 'exact' | 'prefix' | 'fuzzy' | 'text';

/** The class ladder, strongest first. `exact` outranks everything below it. */
export const SEARCH_MATCH_CLASSES = ['exact', 'prefix', 'fuzzy', 'text'] as const;

/** What every result kind carries, whatever it resolves to. */
export interface SearchResultCore {
	/** Stable within its kind; `searchResultValue` namespaces it for cmdk. */
	readonly id: string;
	/** Composed server-side and display-ready. */
	readonly title: string;
	/**
	 * One line, not two. The matched field's text when the match was not on the
	 * title, and the record's context line otherwise.
	 */
	readonly subtitle?: string | undefined;
}

/** A row of one of the twelve corpus tables. */
export interface SearchRecordResult extends SearchResultCore {
	readonly kind: 'record';
	/**
	 * A field rather than a member of the union, so a table joining the corpus is
	 * not a new result kind.
	 */
	readonly table: CorpusTable;
	/** The field that produced the winning class, first in declared order on a tie. */
	readonly matchedField: string;
	readonly matchClass: SearchMatchClass;
	/** Present only where `table` is `routes`; it picks the trap tree or the habitat tree. */
	readonly routeType?: string | undefined;
	/**
	 * True where the record is retired.
	 *
	 * Only `habitats`, `traps` and `weather_sources` carry a lifecycle, so the
	 * field is absent everywhere else rather than false: absent means the table
	 * has no such state, and a reader that renders a marker on truth alone is
	 * right for both. Retirement is not deletion — a soft-deleted record has no
	 * document at all — and it does not affect ranking.
	 */
	readonly retired?: boolean | undefined;
}

/**
 * A comment. Its own member rather than a `record` with two nullable fields,
 * because it is the only result that resolves to somebody else's route.
 */
export interface SearchCommentResult extends SearchResultCore {
	readonly kind: 'comment';
	readonly targetType: CommentTargetType;
	readonly targetId: string;
	readonly matchedField: string;
	readonly matchClass: SearchMatchClass;
}

/**
 * A navigation destination, matched client-side off the shell's own navigation.
 * It carries no `matchClass`, because it never touched the index.
 */
export interface SearchRouteResult extends SearchResultCore {
	readonly kind: 'route';
}

/** A create form, promoted from a navigation item. Matched client-side. */
export interface SearchActionResult extends SearchResultCore {
	readonly kind: 'action';
}

export type SearchResult =
	| SearchRecordResult
	| SearchCommentResult
	| SearchRouteResult
	| SearchActionResult;

/** The two document classes the index holds, and the results page's filter. */
export type SearchDocumentClass = 'records' | 'comments';

/** The shape `GET /search` answers with. */
export interface SearchResponse {
	/** Echoed so the client can tell which request a rendered list came from. */
	readonly query: string;
	/** Flat, in rank order. The client buckets it. */
	readonly results: readonly SearchResult[];
	/** Exact, over the whole match set, narrowed by the class filter when one is set. */
	readonly total: number;
	/** Exact and never narrowed by the filter, or the rail cannot show what the other row holds. */
	readonly counts: { readonly records: number; readonly comments: number };
	readonly offset: number;
	readonly limit: number;
}

/**
 * The value cmdk keys a row by.
 *
 * Derived here rather than sent on the wire: a string the server composes for a
 * UI library it should not know exists is a field that outlives the library. An
 * action and a route can share an id by construction — an action *is* a promoted
 * navigation item — so the kind is what keeps them distinct.
 */
export function searchResultValue(result: SearchResult): string {
	return `${result.kind}:${result.id}`;
}
