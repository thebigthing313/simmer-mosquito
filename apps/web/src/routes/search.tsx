import {
	SEARCH_MAX_OFFSET,
	SEARCH_QUERY_MAX_LENGTH,
	type SearchDocumentClass,
	type SearchResult,
	searchResultValue,
} from '@simmer-mosquito/domain';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import {
	searchResultDestination,
	searchResultIcon,
} from '../components/search/search-destinations';
import {
	SearchRequestError,
	useDebouncedQuery,
	useGlobalSearch,
} from '../components/search/use-global-search';
import { routes as routesCollection } from '../lib/collections/routes';
import {
	type FilterCodecs,
	type SearchCodec,
	searchValidator,
	textParam,
} from '../lib/search-filters';

/**
 * How many rows one slice of the list holds. Infinite scroll fetches the next
 * `offset` at a sentinel, so the wire is unchanged and only the control differs.
 */
const PAGE_SIZE = 25;

/**
 * The `class` filter, which lives in the URL beside `q` or the page is only half
 * deep-linkable.
 */
const classParam: SearchCodec<SearchDocumentClass | 'all'> = {
	decode: (raw) => (raw === 'records' || raw === 'comments' ? raw : undefined),
	encode: (value) => (value === 'all' ? undefined : value),
};

const SEARCH_FILTER_CODECS: FilterCodecs<{
	q: string;
	class: SearchDocumentClass | 'all';
}> = { q: textParam, class: classParam };

export const Route = createFileRoute('/search')({
	component: SearchResultsRoute,
	validateSearch: searchValidator(SEARCH_FILTER_CODECS),
});

/**
 * The full results page.
 *
 * **Not in navigation.** The palette's "View all results" row is how it is
 * reached, and nothing in the 74 destinations points at it. The query is
 * editable here, so re-searching does not mean reopening the palette.
 *
 * It deliberately does **not** reuse `components/explorer`: that frame is built
 * around a map — bbox params, `usePagedMapResource`, filters resolved from
 * synced collections — and search results are cross-domain, non-spatial and come
 * from one endpoint, so the frame would be carried for its list and nothing else.
 *
 * Pages and actions never reach this page. An action was never indexed, so a row
 * here would sit under a count it was not counted against.
 */
function SearchResultsRoute() {
	const navigate = useNavigate();
	const params = Route.useSearch() as { readonly q?: string; readonly class?: SearchDocumentClass };
	const urlQuery = params.q ?? '';
	const documentClass = params.class;

	const [draft, setDraft] = useEditableQuery(urlQuery, navigate);

	const list = useSearchResultList(urlQuery, documentClass);
	const routeLookup = useLiveQuery((query) => query.from({ row: routesCollection }), []);
	const { counts, first, hasMore, next, rows, sentinel, total } = list;

	function open(result: SearchResult) {
		const destination = searchResultDestination(
			result,
			(routeId) => (routeLookup.data ?? []).find((row) => row.id === routeId)?.route_type,
		);
		if (destination !== undefined) {
			navigate({ to: destination.to as never, params: destination.params as never });
		}
	}

	const refused = first.error instanceof SearchRequestError && first.error.refused;
	// A slice that failed part-way down the list is still a failure worth naming.
	// Left to `first` alone, a scroll would simply stop growing with nothing on
	// screen saying why.
	const failed = (first.isError && !refused) || next.isError;
	const loading = urlQuery !== '' && first.isLoading;
	const emptyResult =
		urlQuery !== '' && !loading && !first.isError && !first.isFetching && total === 0;

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-semibold text-2xl text-foreground">Search</h1>
				<Input
					aria-label="Search"
					className="max-w-xl"
					maxLength={SEARCH_QUERY_MAX_LENGTH}
					onChange={(event) => setDraft(event.target.value)}
					placeholder="Search records, pages and actions…"
					value={draft}
				/>
			</div>

			<div className="flex gap-6 max-md:flex-col">
				<FilterRail
					counts={counts}
					documentClass={documentClass}
					onSelect={(next) => setClass(navigate, next)}
				/>

				<ResultList
					failed={failed}
					hasMore={hasMore}
					loading={loading}
					loadingMore={next.isFetching}
					onOpen={open}
					onRetry={() => void (first.isError ? first.refetch() : next.refetch())}
					rows={rows}
					sentinel={sentinel}
				>
					{refused || emptyResult ? (
						<EmptyState
							documentClass={documentClass}
							onClearFilter={() => setClass(navigate, undefined)}
							reason={refused ? first.error?.message : undefined}
						/>
					) : null}
				</ResultList>
			</div>
		</div>
	);
}

function setClass(
	navigate: ReturnType<typeof useNavigate>,
	documentClass: SearchDocumentClass | undefined,
): void {
	navigate({
		to: '/search',
		search: (previous) => ({ ...previous, class: documentClass }),
		replace: true,
	});
}

function FilterRow({
	active,
	count,
	label,
	onSelect,
}: {
	readonly active: boolean;
	readonly count: number;
	readonly label: string;
	readonly onSelect: () => void;
}) {
	return (
		<button
			aria-current={active ? 'true' : undefined}
			className={cn(
				'flex items-center justify-between rounded-md px-3 py-2 text-left text-sm',
				active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
			)}
			onClick={onSelect}
			type="button"
		>
			<span>{label}</span>
			<span className="tabular-nums">{count}</span>
		</button>
	);
}

/**
 * What search reads, and what it does not.
 *
 * It names no tables. `applications` and `collections` *are* reached, through
 * their comments, so listing them as unsearchable would be false the moment
 * somebody finds one — and naming tables in UI copy explains the domain back at
 * the reader, which the copy rules forbid.
 */
function EmptyState({
	documentClass,
	onClearFilter,
	reason,
}: {
	readonly documentClass: SearchDocumentClass | undefined;
	readonly onClearFilter: () => void;
	readonly reason: string | undefined;
}) {
	return (
		<div className="flex flex-col items-start gap-3 rounded-md border p-6">
			<p className="text-foreground text-sm">{reason ?? 'Nothing matched.'}</p>
			{reason === undefined ? (
				<p className="text-muted-foreground text-sm">
					Search reads record names, codes and comments. It does not read custom fields, and it will
					not find a habitat by the address it sits at.
				</p>
			) : null}
			{documentClass === undefined || reason !== undefined ? null : (
				<>
					<p className="text-muted-foreground text-sm">Other types might still match.</p>
					<Button onClick={onClearFilter} size="sm" variant="outline">
						Show everything
					</Button>
				</>
			)}
		</div>
	);
}

/**
 * The accumulated list, its counts, and the sentinel that grows it.
 *
 * Slices are accumulated in state rather than recomputed, because each one is
 * its own query key: without this the list would hold the first slice and the
 * current one, and every slice in between would vanish as the next arrived.
 *
 * Infinite scroll rather than page numbers. The cost is real and accepted:
 * there is no page to return to, so a result opened and backed out of lands at
 * the top of the list again.
 */
function useSearchResultList(query: string, documentClass: SearchDocumentClass | undefined) {
	const [slices, setSlices] = useState(1);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `query` and `documentClass` are this hook's parameters, not outer scope; dropping them keeps the previous query's slice count
	useEffect(() => setSlices(1), [query, documentClass]);

	const nextOffset = (slices - 1) * PAGE_SIZE;
	const first = useGlobalSearch({
		query,
		limit: PAGE_SIZE,
		offset: 0,
		documentClass,
		keepPrevious: false,
	});
	const next = useGlobalSearch({
		query,
		limit: PAGE_SIZE,
		offset: nextOffset,
		documentClass,
		keepPrevious: false,
	});

	const pages = useAccumulatedPages(query, documentClass, [first, next], nextOffset);
	const rows = pages.rows;
	const total = first.data?.total ?? 0;

	/*
	 * Four conditions, and three of them are stops rather than the obvious one.
	 *
	 * `rows.length < total` alone is not enough, because the sentinel effect
	 * re-registers every time `next.isFetching` drops and `observe` fires
	 * immediately for an element already in view. So a slice that never lands — a
	 * failed request, or an offset past the endpoint's own cap — leaves
	 * `rows.length` short of `total` forever and the sentinel walks the offset
	 * upward one request at a time with nothing to show for it.
	 *
	 * A short page is the honest end of the list even when `total` disagrees,
	 * which it can: `total` is counted when the first slice ran, and a record can
	 * be deleted underneath a scroll.
	 */
	const hasMore =
		rows.length < total &&
		!pages.reachedEnd &&
		!next.isError &&
		slices * PAGE_SIZE <= SEARCH_MAX_OFFSET;

	const sentinel = useGrowOnVisible(hasMore && !next.isFetching, () =>
		setSlices((count) => count + 1),
	);

	return {
		counts: first.data?.counts ?? { records: 0, comments: 0 },
		first,
		hasMore,
		next,
		rows,
		sentinel,
		total,
	};
}

/**
 * The slices loaded so far, accumulated rather than recomputed.
 *
 * Each slice is its own query key, so without this the list would hold the first
 * slice and the current one and every slice between them would vanish as the
 * next arrived. Both halves of the echo are checked, not just the query:
 * `offset` is on the wire for exactly this, and it is what tells the second
 * slice's answer apart from the first's.
 */
function useAccumulatedPages(
	query: string,
	documentClass: SearchDocumentClass | undefined,
	[first, next]: readonly [ReturnType<typeof useGlobalSearch>, ReturnType<typeof useGlobalSearch>],
	nextOffset: number,
): { readonly rows: readonly SearchResult[]; readonly reachedEnd: boolean } {
	const [pages, setPages] = useState<Record<number, readonly SearchResult[]>>({});
	// biome-ignore lint/correctness/useExhaustiveDependencies: `query` and `documentClass` are this hook's parameters, not outer scope; dropping them leaves the previous query's rows in the list
	useEffect(() => setPages({}), [query, documentClass]);

	const firstResults =
		first.data?.query === query && first.data.offset === 0 ? first.data.results : undefined;
	const nextResults =
		next.data?.query === query && next.data.offset === nextOffset ? next.data.results : undefined;

	useEffect(() => {
		if (firstResults !== undefined) {
			setPages((current) => ({ ...current, 0: firstResults }));
		}
	}, [firstResults]);

	useEffect(() => {
		if (nextResults !== undefined) {
			setPages((current) => ({ ...current, [nextOffset]: nextResults }));
		}
	}, [nextResults, nextOffset]);

	const lastLoaded = pages[nextOffset];
	return {
		rows: Object.keys(pages)
			.map(Number)
			.sort((left, right) => left - right)
			.flatMap((offset) => pages[offset] ?? []),
		reachedEnd: lastLoaded !== undefined && lastLoaded.length < PAGE_SIZE,
	};
}

/** Calls `grow` whenever the returned sentinel scrolls into view and `armed` is true. */
function useGrowOnVisible(armed: boolean, grow: () => void): RefObject<HTMLDivElement | null> {
	const sentinel = useRef<HTMLDivElement>(null);

	// The call site passes an arrow that only calls a state setter, so the closure
	// the observer holds cannot go stale in a way that is read. A reason that
	// wraps onto a second line stops suppressing, so it stays on the ignore.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `grow` is a fresh closure every render and re-observing on it would loop
	useEffect(() => {
		const node = sentinel.current;
		if (node === null || !armed) {
			return;
		}

		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				grow();
			}
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, [armed]);

	return sentinel;
}

/**
 * The field and the URL, kept in step through the debounce.
 *
 * The URL is the shareable state and the field is what is being typed, so a link
 * opened cold and a query typed here reach the same request. The navigation
 * replaces rather than pushes, or Back would walk one keystroke at a time.
 */
function useEditableQuery(
	urlQuery: string,
	navigate: ReturnType<typeof useNavigate>,
): [string, (value: string) => void] {
	const [draft, setDraft] = useState(urlQuery);
	useEffect(() => setDraft(urlQuery), [urlQuery]);
	const typed = useDebouncedQuery(draft);

	useEffect(() => {
		if (typed !== urlQuery) {
			navigate({ to: '/search', search: (previous) => ({ ...previous, q: typed }), replace: true });
		}
	}, [typed, urlQuery, navigate]);

	return [draft, setDraft];
}

/**
 * Everything / Records / Comments, each with an exact count.
 *
 * The count is what makes the rail worth its width: it answers "is this query
 * mostly comments" before any scrolling. The counts are never narrowed by the
 * filter, or the rail could not show what the other row holds.
 */
function FilterRail({
	counts,
	documentClass,
	onSelect,
}: {
	readonly counts: { readonly records: number; readonly comments: number };
	readonly documentClass: SearchDocumentClass | undefined;
	readonly onSelect: (documentClass: SearchDocumentClass | undefined) => void;
}) {
	const rows = [
		{ label: 'Everything', value: undefined, count: counts.records + counts.comments },
		{ label: 'Records', value: 'records' as const, count: counts.records },
		{ label: 'Comments', value: 'comments' as const, count: counts.comments },
	];

	return (
		<nav aria-label="Filter results" className="flex shrink-0 flex-col gap-1 md:w-48">
			{rows.map((row) => (
				<FilterRow
					active={documentClass === row.value}
					count={row.count}
					key={row.label}
					label={row.label}
					onSelect={() => onSelect(row.value)}
				/>
			))}
		</nav>
	);
}

/**
 * The list itself: the failure strip, the first-query skeletons, the rows, and
 * the sentinel that grows it.
 *
 * One-line rows, which put more of the ranked order in view and make the type a
 * column rather than a heading. A heading can repeat when a class boundary falls
 * mid-slice, which is honest; per-kind paging would break the single `total` and
 * `offset` contract.
 */
function ResultList({
	children,
	failed,
	hasMore,
	loading,
	loadingMore,
	onOpen,
	onRetry,
	rows,
	sentinel,
}: {
	readonly children: ReactNode;
	readonly failed: boolean;
	readonly hasMore: boolean;
	readonly loading: boolean;
	readonly loadingMore: boolean;
	readonly onOpen: (result: SearchResult) => void;
	readonly onRetry: () => void;
	readonly rows: readonly SearchResult[];
	readonly sentinel: RefObject<HTMLDivElement | null>;
}) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			{/*
			 * A strip above the list, same as the palette and for the same reason: a
			 * filter rail and a count are still on screen and still valid.
			 * `RouteErrorPage` stays for what it is for, a render that threw, not a
			 * request that failed.
			 */}
			{failed ? (
				<div className="mb-3 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-muted-foreground text-sm">
					<span>Records and comments are unavailable.</span>
					<Button onClick={onRetry} size="sm" variant="ghost">
						Try again
					</Button>
				</div>
			) : null}

			{loading
				? [0, 1, 2, 3, 4].map((row) => (
						<div className="flex items-center gap-3 border-b px-2 py-3" key={row}>
							<Skeleton className="size-4 rounded" />
							<Skeleton className="h-4 w-1/2" />
						</div>
					))
				: null}

			{children}

			<ul className="flex flex-col">
				{rows.map((result) => (
					<ResultRow key={searchResultValue(result)} onOpen={onOpen} result={result} />
				))}
			</ul>

			{hasMore ? (
				<div className="flex justify-center py-4" ref={sentinel}>
					{loadingMore ? <Spinner aria-label="Loading more results" /> : null}
				</div>
			) : null}
		</div>
	);
}

function ResultRow({
	onOpen,
	result,
}: {
	readonly onOpen: (result: SearchResult) => void;
	readonly result: SearchResult;
}) {
	const Icon = searchResultIcon(result);

	return (
		<li>
			<button
				className="flex w-full items-center gap-3 border-b px-2 py-3 text-left hover:bg-accent"
				onClick={() => onOpen(result)}
				type="button"
			>
				<Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate text-foreground text-sm">{result.title}</span>
				{result.subtitle === undefined ? null : (
					<span className="truncate text-muted-foreground text-xs">{result.subtitle}</span>
				)}
			</button>
		</li>
	);
}
