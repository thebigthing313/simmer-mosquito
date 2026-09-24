import {
	SEARCH_QUERY_MAX_LENGTH,
	type SearchDocumentClass,
	type SearchResult,
	searchResultValue,
} from '@simmer-mosquito/domain';
import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { SearchIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactNode, RefObject } from 'react';
import { AddressSurveillanceLinks } from '../components/address-surveillance';
import { SEARCH_RESULT_ICONS, searchResultIconKey } from '../components/search/search-destinations';
import { RetiredMarker } from '../components/search/search-result-row';
import {
	type AddressSurveillance,
	useAddressSurveillance,
} from '../hooks/queries/use-address-surveillance';
import { useEditableQuery } from '../hooks/search/use-editable-query';
import { SearchRequestError } from '../hooks/search/use-global-search';
import { useSearchResultList } from '../hooks/search/use-search-result-list';
import { useSearchResultOpen } from '../hooks/search/use-search-result-open';
import {
	type FilterCodecs,
	type SearchCodec,
	searchValidator,
	textParam,
} from '../lib/search-filters';

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
	const { counts, first, hasMore, next, rows, sentinel, total } = list;

	// One pair of subsets for the whole list rather than one per address row. The
	// hook caps the ids, so a long scroll through addresses stops growing the
	// predicate rather than growing it without bound.
	const surveillance = useAddressSurveillance(addressResultIds(rows));

	// A route comment opened before the routes collection has answered has no
	// destination yet, and guessing a tree is the bug this replaced. The row is
	// held and opened when the lookup lands.
	const opening = useSearchResultOpen((destination) =>
		navigate({ to: destination.to as never, params: destination.params as never }),
	);

	const refused = first.error instanceof SearchRequestError && first.error.refused;
	// A slice that failed part-way down the list is still a failure worth naming.
	// Left to `first` alone, a scroll would simply stop growing with nothing on
	// screen saying why.
	const failed = (first.isError && !refused) || next.isError;
	const loading = urlQuery !== '' && first.isLoading;
	const emptyResult =
		urlQuery !== '' && !loading && !first.isError && !first.isFetching && total === 0;

	// `record` is the measure the route-loading skeleton reserves, so the page
	// arrives at the width it stood in for rather than under a `max-w-5xl` of its
	// own (#1043, #1046), and the heading is a `PageHeader` so its title lands
	// where the skeleton's title bar sat rather than a size below it (#1056).
	// The input is the page's subject and stays under the header rather than in
	// its action slot; it keeps its `max-w-xl`. The result rows are #1047's.
	return (
		<div className={pageContainer({ gap: 'overview', measure: 'record', padding: 'page' })}>
			<div className="flex flex-col gap-4">
				<PageHeader icon={SearchIcon} title="Search" />
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
					onOpen={opening.select}
					onRetry={() => void (first.isError ? first.refetch() : next.refetch())}
					rows={rows}
					sentinel={sentinel}
					surveillance={surveillance}
					waitingValue={opening.waitingValue}
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
						Show Everything
					</Button>
				</>
			)}
		</div>
	);
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
	surveillance,
	waitingValue,
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
	/** The Habitats and Traps at every address on screen, keyed by address id. */
	readonly surveillance: AddressSurveillance;
	/** The row that was opened and is waiting on a lookup, drawn as pending. */
	readonly waitingValue: string | undefined;
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
						Try Again
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
					<ResultRow
						key={searchResultValue(result)}
						onOpen={onOpen}
						pending={searchResultValue(result) === waitingValue}
						result={result}
						surveillance={surveillance}
					/>
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
	pending,
	result,
	surveillance,
}: {
	readonly onOpen: (result: SearchResult) => void;
	/** Opened, and waiting on the lookup that says where it goes. */
	readonly pending: boolean;
	readonly result: SearchResult;
	readonly surveillance: AddressSurveillance;
}) {
	const Icon = SEARCH_RESULT_ICONS[searchResultIconKey(result)];
	const addressId =
		result.kind === 'record' && result.table === 'addresses' ? result.id : undefined;

	return (
		// The border moves to the row rather than the button, or the links would
		// hang below the line that is meant to close the row.
		<li className="border-b">
			<button
				aria-busy={pending ? true : undefined}
				className="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-accent"
				onClick={() => onOpen(result)}
				type="button"
			>
				{/* The spinner takes the icon's place rather than sitting beside it, or
				    the row would reflow the moment it is opened. */}
				{pending ? (
					<Spinner aria-label="Opening" className="size-4 shrink-0 text-muted-foreground" />
				) : (
					<Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				)}
				<span className="truncate text-foreground text-sm">{result.title}</span>
				<RetiredMarker result={result} />
				{result.subtitle === undefined ? null : (
					<span className="truncate text-muted-foreground text-xs">{result.subtitle}</span>
				)}
			</button>
			{/* Search will not match an address row on what sits at it, so the row
			    carries the sites instead, one click rather than a second search. */}
			{addressId === undefined ? null : (
				<AddressSurveillanceLinks
					className="px-2 pb-3"
					habitats={surveillance.habitatsByAddress.get(addressId) ?? []}
					traps={surveillance.trapsByAddress.get(addressId) ?? []}
				/>
			)}
		</li>
	);
}

/** The ids of the address rows on screen, which are the only rows that grow links. */
function addressResultIds(rows: readonly SearchResult[]): readonly string[] {
	return rows
		.filter((row) => row.kind === 'record' && row.table === 'addresses')
		.map((row) => row.id);
}
