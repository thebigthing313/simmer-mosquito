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
import { useNavigate } from '@tanstack/react-router';
import { type RefObject, useState } from 'react';
import type { AuthMe } from '../../auth';
import { SearchResultRow } from './search-result-row';
import { type PaletteDestination, usePaletteContent } from './use-palette-content';
import { useDeferredOpen } from './use-search-navigation';

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
	triggerRef,
}: {
	readonly auth: AuthMe | null;
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	/** The header button focus goes back to on close. */
	readonly triggerRef: RefObject<HTMLButtonElement | null>;
}) {
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const content = usePaletteContent(auth, query);
	const { debouncedQuery, dimmed, empty, failed, firstQuery, groups, offline, total } = content;

	// Absent on failure, in flight and on no matches. On failure that leaves no
	// route to the results page, which is right: the page would fail the same way.
	const showViewAll = query !== '' && !failed && !firstQuery && !empty && total > 0;

	function close() {
		onOpenChange(false);
		// A row selected and still waiting on its lookup is dropped here, or it
		// would navigate on its own after the reader dismissed the palette.
		opening.cancel();
		// Every open starts at the action list. The request in flight is not
		// aborted: it finishes into the cache, so reopening on the same query
		// inside `staleTime` renders instantly.
		setQuery('');
	}

	function go(destination: PaletteDestination) {
		close();
		// The shell models destinations as plain strings; the router's typed `to` is
		// satisfied by an assertion at this one adapter seam, exactly as
		// `AppShellRoot.onNavigate` does.
		navigate({ to: destination.to as never, params: destination.params as never });
	}

	// A route comment selected before the routes collection has answered has no
	// destination yet. The row is held and opened when the lookup lands, so the
	// selection reads as a wait instead of a click that did nothing.
	const opening = useDeferredOpen(content.destinationOf, go);

	return (
		<Dialog onOpenChange={(next) => (next ? onOpenChange(true) : close())} open={open}>
			<DialogContent
				className="overflow-hidden p-0"
				onCloseAutoFocus={(event) => {
					/*
					 * Radix restores focus through `DialogTrigger`'s own ref and
					 * suppresses its fallback to the previously focused element. This
					 * palette has no `DialogTrigger`: the button lives in
					 * `packages/ui-web`, in a different tree, and reaches this through a
					 * context. So the ref is null, the fallback is already suppressed,
					 * and focus lands on `<body>` — measured, not assumed.
					 */
					event.preventDefault();
					triggerRef.current?.focus();
				}}
				showCloseButton={false}
			>
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
				<Command
					filter={() => 1}
					onValueChange={content.setValue}
					shouldFilter={false}
					value={content.value}
				>
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
						{announcement({
							query,
							failed,
							firstQuery,
							empty,
							total,
							opening: opening.waitingValue !== undefined,
						})}
					</span>
					<CommandList>
						{failed ? <UnavailableStrip offline={offline} onRetry={content.refetch} /> : null}

						<ResultGroup
							dimmed={false}
							heading="Pages"
							onSelect={opening.select}
							results={groups.pages}
							waitingValue={opening.waitingValue}
						/>

						<ResultGroup
							dimmed={false}
							heading="Actions"
							onSelect={opening.select}
							results={groups.actions}
							waitingValue={opening.waitingValue}
						/>

						{firstQuery ? <PendingRows /> : null}

						<ResultGroup
							dimmed={dimmed}
							heading="Records"
							onSelect={opening.select}
							results={groups.records}
							waitingValue={opening.waitingValue}
						/>

						<ResultGroup
							dimmed={dimmed}
							heading="Comments"
							onSelect={opening.select}
							results={groups.comments}
							waitingValue={opening.waitingValue}
						/>

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

function announcement(state: {
	readonly query: string;
	readonly failed: boolean;
	readonly firstQuery: boolean;
	readonly empty: boolean;
	readonly total: number;
	readonly opening: boolean;
}): string {
	if (state.opening) {
		return 'Opening';
	}
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

/**
 * One heading and its rows, absent entirely when it has none.
 *
 * No group announces its own emptiness: an empty `Records` heading is noise on
 * every navigational query.
 */
function ResultGroup({
	dimmed,
	heading,
	onSelect,
	results,
	waitingValue,
}: {
	readonly dimmed: boolean;
	readonly heading: string;
	readonly onSelect: (result: SearchResult) => void;
	readonly results: readonly SearchResult[];
	/** The row that was selected and is waiting on a lookup, drawn as pending. */
	readonly waitingValue: string | undefined;
}) {
	if (results.length === 0) {
		return null;
	}

	return (
		<CommandGroup heading={heading}>
			{results.map((result) => (
				<SearchResultRow
					dimmed={dimmed}
					key={searchResultValue(result)}
					onSelect={() => onSelect(result)}
					pending={searchResultValue(result) === waitingValue}
					result={result}
					value={searchResultValue(result)}
				/>
			))}
		</CommandGroup>
	);
}

/**
 * The first query's placeholder: one group, not two, because which rows are
 * records and which are comments is not known until the answer arrives.
 */
function PendingRows() {
	return (
		<CommandGroup heading="Records">
			{[0, 1, 2].map((row) => (
				<div className="flex items-center gap-3 px-2 py-2" key={row}>
					<Skeleton className="size-4 rounded" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			))}
		</CommandGroup>
	);
}

/**
 * A strip, never a block.
 *
 * `ErrorReport` is wrong here: a stack disclosure and a copy button do not go in
 * a 380px dropdown. Naming what failed matters precisely because the working
 * half of the palette is still on screen and would otherwise read as a complete
 * answer. Offline gets the same strip with different copy and no retry, read off
 * `navigator.onLine` the way `ErrorReport` already does.
 */
function UnavailableStrip({
	offline,
	onRetry,
}: {
	readonly offline: boolean;
	readonly onRetry: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-muted-foreground text-xs">
			<span>
				{offline
					? 'You are offline. Records and comments are unavailable.'
					: 'Records and comments are unavailable.'}
			</span>
			{offline ? null : (
				<Button onClick={onRetry} size="sm" variant="ghost">
					Try again
				</Button>
			)}
		</div>
	);
}
