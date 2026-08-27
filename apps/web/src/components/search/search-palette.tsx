import {
	SEARCH_QUERY_MAX_LENGTH,
	type SearchResult,
	searchResultValue,
} from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { AuthMe } from '../../auth';
import { routes as routesCollection } from '../../lib/collections/routes';
import { shellSearchCandidates, type WebShellCandidate } from '../app-shell/navigation';
import { searchResultDestination } from './search-destinations';
import {
	bucketServerResults,
	capPaletteGroups,
	matchCandidates,
	type PaletteGroups,
} from './search-matching';
import { SearchResultRow } from './search-result-row';
import { useDebouncedQuery, useGlobalSearch } from './use-global-search';

/**
 * The server budget the palette asks for.
 *
 * Above its own ten-row list, because the group caps re-select from what comes
 * back: a query answering with sixteen records and four comments has to bring
 * enough of both for the caps to choose between them.
 */
const PALETTE_SERVER_LIMIT = 30;

/**
 * The command palette: pages, actions, records and comments over one input.
 *
 * It lives in `apps/web` and not in `packages/ui-web` because it reads
 * `navigation.ts` and the table-to-route map, both of which are typed against
 * this app's route tree. The trigger stays in the package and reaches this
 * through `SearchTriggerProvider`.
 */
export function SearchPalette({
	auth,
	onOpenChange,
	open,
}: {
	readonly auth: AuthMe | null;
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const debouncedQuery = useDebouncedQuery(query);

	// cmdk compares selection by string, and its only recovery from a selection
	// that vanished is an item-unregister cleanup guarded on a node captured at
	// cleanup time and scheduled into a keyed slot. When several items unmount in
	// one commit the last cleanup overwrites the slot and the reset never fires,
	// so the value is controlled here and reset on every result swap instead.
	const [value, setValue] = useState('');

	const { routes: routeCandidates, actions: actionCandidates } = shellSearchCandidates(auth);
	const routeLookup = useLiveQuery((query) => query.from({ row: routesCollection }), []);

	const search = useGlobalSearch({ query: debouncedQuery, limit: PALETTE_SERVER_LIMIT });
	// The answer on screen may be a previous query's, held by `placeholderData`.
	// Only the server groups are allowed to say so by dimming: pages and actions
	// were matched against the current keystroke.
	// The debounce window counts as in flight for both of these. Nothing has been
	// requested yet during it, so `isFetching` is false while the list on screen
	// is already a keystroke behind.
	const pending = search.isFetching || debouncedQuery !== query;
	const answered = search.data?.query === query;
	const dimmed = pending && !answered;

	// Routes and actions match the *un-debounced* value, so the list never goes
	// empty while the request catches up.
	const pages = query === '' ? [] : matchCandidates(routeCandidates, query).map(toRouteResult);
	const actions =
		query === ''
			? // The empty state is the whole action list, after the write floor
				// filter, in navigation order. A palette that opens blank teaches
				// nothing about what it can do; pages stay out because seventy-four
				// destinations is not a list.
				actionCandidates.map(toActionResult)
			: matchCandidates(actionCandidates, query).map(toActionResult);

	const server = bucketServerResults(search.data?.results ?? []);
	const groups: PaletteGroups = capPaletteGroups({
		pages,
		actions,
		records: query === '' ? [] : server.records,
		comments: query === '' ? [] : server.comments,
	});

	const rowValues = [...groups.pages, ...groups.actions, ...groups.records, ...groups.comments]
		.map(searchResultValue)
		.join('|');
	useEffect(() => {
		setValue('');
	}, [rowValues]);

	const total = search.data?.total ?? 0;
	const failed = search.isError;
	const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
	const firstQuery = query !== '' && pending && search.data === undefined;
	// Guarded on `pending` and not on `isFetching`: for the 200ms the debounce is
	// holding, no request has started, so `isFetching` is false and every
	// navigational miss would flash "No matches" before the request goes out.
	const empty =
		query !== '' &&
		!pending &&
		!failed &&
		groups.pages.length === 0 &&
		groups.actions.length === 0 &&
		groups.records.length === 0 &&
		groups.comments.length === 0;
	// Absent on failure, in flight and on no matches. On failure that leaves no
	// route to the results page, which is right: the page would fail the same way.
	const showViewAll = query !== '' && !failed && !firstQuery && !empty && total > 0;

	function close() {
		onOpenChange(false);
		// Every open starts at the action list. The request in flight is not
		// aborted: it finishes into the cache, so reopening on the same query
		// inside `staleTime` renders instantly.
		setQuery('');
	}

	function go(destination: { readonly to: string; readonly params?: { readonly id: string } }) {
		close();
		// The shell models destinations as plain strings; the router's typed `to` is
		// satisfied by an assertion at this one adapter seam, exactly as
		// `AppShellRoot.onNavigate` does.
		navigate({ to: destination.to as never, params: destination.params as never });
	}

	function onSelectResult(result: SearchResult) {
		if (result.kind === 'route' || result.kind === 'action') {
			const candidate = [...routeCandidates, ...actionCandidates].find(
				(entry) => entry.id === result.id,
			);
			if (candidate !== undefined) {
				go({ to: candidate.to as string });
			}
			return;
		}

		const destination = searchResultDestination(
			result,
			(routeId) => (routeLookup.data ?? []).find((row) => row.id === routeId)?.route_type,
		);
		if (destination !== undefined) {
			go({ to: destination.to as string, params: destination.params });
		}
	}

	return (
		<Dialog onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open}>
			<DialogContent className="overflow-hidden p-0" showCloseButton={false}>
				<DialogHeader className="sr-only">
					<DialogTitle>Search</DialogTitle>
					<DialogDescription>Search records, pages and actions.</DialogDescription>
				</DialogHeader>
				{/*
				 * Both switches, not one. Item value registration runs `command-score`
				 * once per item per value change *outside* the `shouldFilter` guard, so
				 * without `filter` every result is scored and the score thrown away.
				 * `shouldFilter={false}` is also what fixes the group order: cmdk
				 * reorders groups inside the same sort it reorders items in, so the
				 * fixed group order and the server's ranking inside each group are
				 * bought together.
				 */}
				<Command filter={() => 1} onValueChange={setValue} shouldFilter={false} value={value}>
					<CommandInput
						maxLength={SEARCH_QUERY_MAX_LENGTH}
						onValueChange={setQuery}
						placeholder="Search records, pages and actions…"
						value={query}
					/>
					{/*
					 * Mounted beside the input for the palette's whole lifetime rather
					 * than inside the list, copying `map-search.tsx` and its reason: a
					 * live region that appears in the same frame as its text is not read
					 * reliably. Announcement otherwise runs through
					 * `aria-activedescendant`; this covers what that cannot express,
					 * mainly zero results.
					 */}
					<span aria-live="polite" className="sr-only" role="status">
						{announcement({ query, failed, firstQuery, empty, total })}
					</span>
					<CommandList>
						{failed ? (
							// A strip, never a block. `ErrorReport` is wrong here: a stack
							// disclosure and a copy button do not go in a 380px dropdown.
							// Naming what failed matters precisely because the working half
							// of the palette is still on screen and would otherwise read as
							// a complete answer.
							<div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
								<span>
									{offline
										? 'You are offline. Records and comments are unavailable.'
										: 'Records and comments are unavailable.'}
								</span>
								{offline ? null : (
									<Button onClick={() => void search.refetch()} size="sm" variant="ghost">
										Try again
									</Button>
								)}
							</div>
						) : null}

						{groups.pages.length === 0 ? null : (
							<CommandGroup heading="Pages">
								{groups.pages.map((result) => (
									<SearchResultRow
										dimmed={false}
										key={searchResultValue(result)}
										onSelect={() => onSelectResult(result)}
										result={result}
										value={searchResultValue(result)}
									/>
								))}
							</CommandGroup>
						)}

						{groups.actions.length === 0 ? null : (
							<CommandGroup heading="Actions">
								{groups.actions.map((result) => (
									<SearchResultRow
										dimmed={false}
										key={searchResultValue(result)}
										onSelect={() => onSelectResult(result)}
										result={result}
										value={searchResultValue(result)}
									/>
								))}
							</CommandGroup>
						)}

						{firstQuery ? (
							// One group, not two: which rows are records and which are
							// comments is not known until the answer arrives.
							<CommandGroup heading="Records">
								{[0, 1, 2].map((row) => (
									<div className="flex items-center gap-3 px-2 py-2" key={row}>
										<Skeleton className="size-4 rounded" />
										<Skeleton className="h-4 w-2/3" />
									</div>
								))}
							</CommandGroup>
						) : null}

						{groups.records.length === 0 ? null : (
							<CommandGroup heading="Records">
								{groups.records.map((result) => (
									<SearchResultRow
										dimmed={dimmed}
										key={searchResultValue(result)}
										onSelect={() => onSelectResult(result)}
										result={result}
										value={searchResultValue(result)}
									/>
								))}
							</CommandGroup>
						)}

						{groups.comments.length === 0 ? null : (
							<CommandGroup heading="Comments">
								{groups.comments.map((result) => (
									<SearchResultRow
										dimmed={dimmed}
										key={searchResultValue(result)}
										onSelect={() => onSelectResult(result)}
										result={result}
										value={searchResultValue(result)}
									/>
								))}
							</CommandGroup>
						)}

						{/*
						 * All or nothing, and behind an explicit `!isFetching` guard rather
						 * than `CommandEmpty`, which only reads whether the filtered count
						 * is zero and would say "no matches" while the request is still in
						 * flight. No group announces its own emptiness: an empty `Records`
						 * heading is noise on every navigational query.
						 */}
						{empty ? (
							<p className="px-3 py-6 text-center text-sm text-muted-foreground">
								No matches for “{query}”.
							</p>
						) : null}

						{showViewAll ? (
							<>
								<CommandSeparator />
								{/*
								 * Selectable like any other row rather than a footer button,
								 * and it never carries a count: the ten rows above are not the
								 * results page's first ten, so "View all 47 results" would
								 * imply a continuity that is not there.
								 */}
								<CommandItem
									className={dimmed ? 'opacity-50' : undefined}
									onSelect={() => {
										close();
										navigate({ to: '/search', search: { q: debouncedQuery } });
									}}
									value="view-all-results"
								>
									View all results
								</CommandItem>
							</>
						) : null}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
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

function announcement(state: {
	readonly query: string;
	readonly failed: boolean;
	readonly firstQuery: boolean;
	readonly empty: boolean;
	readonly total: number;
}): string {
	if (state.query === '') {
		return '';
	}
	if (state.failed) {
		return 'Records and comments are unavailable';
	}
	if (state.firstQuery) {
		return 'Searching';
	}
	if (state.empty) {
		return 'No matches';
	}
	return `${state.total} results`;
}
