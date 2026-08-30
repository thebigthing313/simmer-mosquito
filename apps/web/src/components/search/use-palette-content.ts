import { type SearchResult, searchResultValue } from '@simmer-mosquito/domain';
import { useEffect, useState } from 'react';
import type { AuthMe } from '../../auth';
import { shellSearchCandidates, type WebShellCandidate } from '../app-shell/navigation';
import {
	type DestinationResolution,
	type RouteTypeIndex,
	searchResultDestination,
} from './search-destinations';
import {
	bucketServerResults,
	capPaletteGroups,
	matchCandidates,
	type PaletteGroups,
} from './search-matching';
import { useDebouncedQuery, useGlobalSearch } from './use-global-search';
import { useRouteTypeIndex } from './use-search-navigation';

/**
 * The server budget the palette asks for.
 *
 * Above its own ten-row list, because the group caps re-select from what comes
 * back: a query answering with sixteen records and four comments has to bring
 * enough of both for the caps to choose between them.
 */
const PALETTE_SERVER_LIMIT = 30;

export interface PaletteContent {
	/** The query the server has been asked about, which trails the field by the debounce. */
	readonly debouncedQuery: string;
	/** The four groups, capped, in the order they are drawn. */
	readonly groups: PaletteGroups;
	/** cmdk's controlled selection, and its setter for `onValueChange`. */
	readonly value: string;
	readonly setValue: (value: string) => void;
	/** Only the server groups dim; pages and actions matched the current keystroke. */
	readonly dimmed: boolean;
	readonly failed: boolean;
	readonly offline: boolean;
	readonly firstQuery: boolean;
	readonly empty: boolean;
	readonly total: number;
	readonly refetch: () => void;
	/** Where a row goes, whether that is known yet, and whether it goes anywhere. */
	readonly destinationOf: (result: SearchResult) => DestinationResolution<PaletteDestination>;
}

export interface PaletteDestination {
	readonly to: string;
	readonly params?: { readonly id: string };
}

/**
 * Everything the palette draws, derived from one query string.
 *
 * Split out of the component because the component was one 290-line function
 * that both derived this and rendered it, which `pnpm fallow:health` fails on.
 * The split is along a real seam: nothing below is about layout, and nothing in
 * the component is about what the four groups hold.
 */
export function usePaletteContent(auth: AuthMe | null, query: string): PaletteContent {
	const debouncedQuery = useDebouncedQuery(query);

	// cmdk compares selection by string, and its only recovery from a selection
	// whose row has unmounted is an item-unregister cleanup guarded on a node
	// captured at cleanup time and scheduled into a keyed slot: when several items
	// unmount in one commit the last cleanup overwrites the slot and the reset
	// never fires. So it is controlled here.
	const [value, setValue] = useState('');

	const { routes: routeCandidates, actions: actionCandidates } = shellSearchCandidates(auth);
	const routeTypes = useRouteTypeIndex();
	const search = useGlobalSearch({ query: debouncedQuery, limit: PALETTE_SERVER_LIMIT });

	// The debounce window counts as in flight. Nothing has been requested during
	// it, so `isFetching` is false while the list on screen is already a keystroke
	// behind, and every state below that reads "not loading" would be wrong.
	const pending = search.isFetching || debouncedQuery !== query;
	const answered = search.data?.query === query;

	const groups = buildGroups(query, { routeCandidates, actionCandidates }, search.data?.results);

	const orderedValues = [
		...groups.pages,
		...groups.actions,
		...groups.records,
		...groups.comments,
	].map(searchResultValue);
	const rowValues = orderedValues.join('|');
	const firstValue = orderedValues[0] ?? '';

	/*
	 * The selection is reset to the *first row* on every result swap, not to `''`.
	 *
	 * Measured: with `''`, cmdk auto-selects row 1 on the first result set and
	 * selects nothing at all on the second, so after typing a second query no row
	 * is highlighted and Enter does nothing. Naming the row keeps one selected
	 * across every swap.
	 *
	 * What this does *not* fix is `aria-activedescendant`, which is absent on
	 * every fresh result set and correct only after the first arrow key. cmdk
	 * resolves it through an id map its items populate on mount, and a selection
	 * made in the same commit as the mount misses that lookup with nothing to
	 * recompute it. Writing the attribute by hand is clobbered by the next render;
	 * both were tried. Enter is unaffected, because cmdk's Enter path queries the
	 * DOM for `[cmdk-item][aria-selected="true"]` rather than reading its state.
	 * Fixing it properly is a change to cmdk.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: `rowValues` is the joined row set, and the rows can swap while `firstValue` stays the same
	useEffect(() => {
		setValue(firstValue);
	}, [rowValues, firstValue]);

	const empty =
		query !== '' &&
		!pending &&
		!search.isError &&
		groups.pages.length === 0 &&
		groups.actions.length === 0 &&
		groups.records.length === 0 &&
		groups.comments.length === 0;

	return {
		debouncedQuery,
		groups,
		value,
		setValue,
		dimmed: pending && !answered,
		failed: search.isError,
		offline: typeof navigator !== 'undefined' && navigator.onLine === false,
		firstQuery: query !== '' && pending && search.data === undefined,
		empty,
		total: search.data?.total ?? 0,
		refetch: () => void search.refetch(),
		destinationOf: (result) =>
			resolveDestination(result, [...routeCandidates, ...actionCandidates], routeTypes),
	};
}

/**
 * A row's destination.
 *
 * A route and an action carry the navigation item's own `to`, so they resolve
 * against the candidate list rather than the table-to-route map; a record or a
 * comment goes through the map.
 */
function resolveDestination(
	result: SearchResult,
	candidates: readonly WebShellCandidate[],
	routeTypes: RouteTypeIndex,
): DestinationResolution<PaletteDestination> {
	if (result.kind === 'route' || result.kind === 'action') {
		const candidate = candidates.find((entry) => entry.id === result.id);
		return candidate === undefined
			? { status: 'unresolved' }
			: { status: 'ready', destination: { to: candidate.to as string } };
	}

	const resolution = searchResultDestination(result, routeTypes);
	return resolution.status === 'ready'
		? {
				status: 'ready',
				destination: {
					to: resolution.destination.to as string,
					params: resolution.destination.params,
				},
			}
		: resolution;
}

function toRouteResult(candidate: WebShellCandidate): SearchResult {
	return {
		kind: 'route',
		id: candidate.id,
		title: candidate.label,
		subtitle: candidate.domainLabel,
	};
}

function toActionResult(candidate: WebShellCandidate): SearchResult {
	// The row reads as the nav label verbatim — "Create Habitat" — under the
	// domain entity icon of the record it creates.
	return { kind: 'action', id: candidate.id, title: candidate.label };
}

/**
 * The four groups, before the row budget and after it.
 *
 * Routes and actions are matched against the *un-debounced* query, so the list
 * never goes empty while the request catches up; records and comments come from
 * whatever the last answer held.
 */
function buildGroups(
	query: string,
	candidates: {
		readonly routeCandidates: readonly WebShellCandidate[];
		readonly actionCandidates: readonly WebShellCandidate[];
	},
	results: readonly SearchResult[] | undefined,
): PaletteGroups {
	if (query === '') {
		// The empty state is the whole action list, after the write floor filter,
		// in navigation order. It skips the caps on purpose: the caps are a budget
		// for a searched list where four kinds compete for ten rows, and capped
		// this showed ten actions of fifteen with the missing five reading as not
		// existing. Pages stay out because seventy-four destinations is not a list.
		return {
			pages: [],
			actions: candidates.actionCandidates.map(toActionResult),
			records: [],
			comments: [],
		};
	}

	const server = bucketServerResults(results ?? []);
	return capPaletteGroups({
		pages: matchCandidates(candidates.routeCandidates, query).map(toRouteResult),
		actions: matchCandidates(candidates.actionCandidates, query).map(toActionResult),
		records: server.records,
		comments: server.comments,
	});
}
