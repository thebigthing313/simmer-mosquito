import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import {
	ArrowRightIcon,
	CheckCircle2Icon,
	ChevronRightIcon,
	CircleIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useMemo, useState } from 'react';
import { WriteOnly } from '../../components/write-only';
import { trapDisplayName } from '../../hooks/queries/trap-view';
import type { TrapListing } from '../../hooks/queries/use-active-traps';
import { useSpeciesNames } from '../../hooks/queries/use-species-names';
import { useTrapCollections } from '../../hooks/queries/use-trap-collections';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import {
	CollectionFlagBadges,
	collectionEffectiveDate,
	isPendingCollection,
	SpeciesSexBadge,
	SpeciesStatusBadge,
} from './-adult-display';
import { formatWeekdayMonthDay } from './-overview-data';
import {
	type CollectionYear,
	type DirectoryCollection,
	type DirectorySpecies,
	groupByYear,
	specimenTotals,
	summaryLabel,
} from './-trap-directory-data';
import { DirectoryTab, DirectoryTabsList } from './-trap-directory-tabs';

const CollectionIcon = iconRegistry.entities.collection.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const AddIcon = iconRegistry.actions.add.icon;

/**
 * How many seasons load without being asked for. The window itself, and why it
 * exists, are in {@link useTrapCollections}.
 */
const DEFAULT_SEASONS = 3;

/**
 * Everything one trap has produced, read as a season at a time.
 *
 * The directory's right half. A trap's collections are a long, flat run of dates
 * that only becomes navigable once it is cut by year — an operator asking "what
 * did this trap do last summer" is asking a question about a season, not about
 * the most recent ten rows. Each collection stays collapsed until it is opened,
 * so the year reads as a run of dates first and a specimen list only on request.
 */
export function TrapCollectionHistory({ trap }: { readonly trap: TrapListing }) {
	// Older seasons are asked for, not loaded up front — see DEFAULT_SEASONS.
	const [allSeasons, setAllSeasons] = useState(false);
	const timeZone = useOrganizationTimeZone();

	const { collections, isReady, isError } = useTrapCollections(trap.id, {
		seasons: allSeasons ? null : DEFAULT_SEASONS,
		timeZone,
	});

	const years = useMemo(
		() => groupByYear(collections as readonly DirectoryCollection[], timeZone),
		[collections, timeZone],
	);

	// Resolved once for the pane rather than inside each row: reading the catalog
	// per expanded collection would put a query behind every disclosure on the page.
	const speciesNameById = useSpeciesNames();

	return (
		<CollectionYears
			header={<TrapHeader trap={trap} />}
			isError={isError}
			isReady={isReady}
			onLoadEarlier={allSeasons ? undefined : () => setAllSeasons(true)}
			speciesNameById={speciesNameById}
			timeZone={timeZone}
			years={years}
		/>
	);
}

// --- the trap ---------------------------------------------------------------

function TrapHeader({ trap }: { readonly trap: TrapListing }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid min-w-0 gap-1">
				<h2 className="m-0 truncate font-semibold text-foreground text-lg leading-tight">
					{trapDisplayName(trap)}
				</h2>
				<p className="m-0 flex items-center gap-2 text-muted-foreground text-sm">
					{trap.methodName}
					<span aria-hidden="true">·</span>
					<span className="inline-flex items-center gap-1">
						{trap.isActive ? (
							<CheckCircle2Icon aria-hidden="true" className="size-3.5 text-success" />
						) : (
							<CircleIcon aria-hidden="true" className="size-3.5" />
						)}
						{trap.isActive ? 'Active' : 'Inactive'}
					</span>
				</p>
			</div>
			<div className="flex shrink-0 flex-wrap items-center gap-2">
				<Button asChild size="sm" variant="outline">
					<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id">
						<TrapIcon aria-hidden="true" />
						Open Trap
					</Link>
				</Button>
				<WriteOnly>
					<Button asChild size="sm">
						<Link search={{ trapId: trap.id }} to="/adult-surveillance/collections/create">
							<AddIcon aria-hidden="true" />
							Record Collection
						</Link>
					</Button>
				</WriteOnly>
			</div>
		</div>
	);
}

// --- the years --------------------------------------------------------------

function CollectionYears({
	years,
	isReady,
	isError,
	speciesNameById,
	timeZone,
	header,
	onLoadEarlier,
}: {
	readonly years: readonly CollectionYear[];
	readonly isReady: boolean;
	readonly isError: boolean;
	readonly speciesNameById: ReadonlyMap<string, string>;
	/** Resolved once for the pane and handed down, not read per row. */
	readonly timeZone: string;
	/** The trap this history belongs to, pinned above its own scroll. */
	readonly header: ReactNode;
	/** Lifts the default season window. Absent once every season is loaded. */
	readonly onLoadEarlier?: (() => void) | undefined;
}) {
	// The open year is held here rather than in the URL: it belongs to the trap in
	// view, and a year that is meaningful for one trap need not exist for the next.
	// Falling back to the first group re-anchors on every trap change.
	const [openYear, setOpenYear] = useState<string | null>(null);
	const active = years.find((year) => year.key === openYear) ?? years[0];

	if (isError) {
		return (
			<HistoryFrame header={header}>
				<HistoryMessage
					description="Collection records could not be loaded. Try again shortly."
					title="Collections Unavailable"
				/>
			</HistoryFrame>
		);
	}
	if (!isReady) {
		return (
			<HistoryFrame header={header}>
				<div className="grid gap-2">
					{[0, 1, 2, 3, 4].map((index) => (
						<Skeleton className="h-12 w-full" key={index} />
					))}
				</div>
			</HistoryFrame>
		);
	}
	if (active === undefined) {
		return (
			<HistoryFrame header={header}>
				<HistoryMessage
					description="Nothing has been collected from this trap yet. Record a collection to start its history."
					title="No Collections"
				/>
			</HistoryFrame>
		);
	}

	return (
		<Tabs
			className="flex h-full min-h-0 flex-col gap-0"
			onValueChange={setOpenYear}
			value={active.key}
		>
			<HistoryFrame
				header={header}
				tabs={
					<div className="flex items-center gap-2">
						<div className="min-w-0 flex-1">
							<DirectoryTabsList label="Season">
								{years.map((year) => (
									<DirectoryTab key={year.key} value={year.key}>
										{year.label}
										<span className="text-muted-foreground text-xs tabular-nums">
											{year.collections.length}
										</span>
									</DirectoryTab>
								))}
							</DirectoryTabsList>
						</div>
						{onLoadEarlier === undefined ? null : (
							<Button className="shrink-0" onClick={onLoadEarlier} size="sm" variant="ghost">
								Earlier seasons
							</Button>
						)}
					</div>
				}
			>
				{/*
				 * One panel, always the open year's: Radix mounts only the open tab
				 * anyway, so rendering the other years' panels would build markup no one
				 * can see and re-run every species roll-up behind it.
				 */}
				<TabsContent value={active.key}>
					<ul className="grid list-none gap-0 divide-y divide-border/40 overflow-hidden rounded-md border border-border/50 p-0">
						{active.collections.map((collection) => (
							<CollectionRow
								collection={collection}
								key={collection.id}
								speciesNameById={speciesNameById}
								timeZone={timeZone}
							/>
						))}
					</ul>
				</TabsContent>
			</HistoryFrame>
		</Tabs>
	);
}

/**
 * The pane's geometry: the trap and its years pinned, the collections scrolling
 * under them.
 *
 * A season runs to seventy-odd dates. Let the header scroll with them and by row
 * twenty the reader has a column of dates with no trap name over it, no year
 * strip to move between seasons, and the Record Collection button somewhere
 * above the viewport.
 */
function HistoryFrame({
	header,
	tabs,
	children,
}: {
	readonly header: ReactNode;
	readonly tabs?: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className={stickyHeader({ gap: 'default', padding: 'roomy' })}>
				{header}
				{tabs}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-6">{children}</div>
		</div>
	);
}

// --- one collection ---------------------------------------------------------

export function CollectionRow({
	collection,
	speciesNameById,
	timeZone,
}: {
	readonly collection: DirectoryCollection;
	readonly speciesNameById: ReadonlyMap<string, string>;
	/**
	 * Passed down rather than read here. A row is a leaf rendered once per
	 * collection in a season, and subscribing each one to the organization
	 * collection would open a live query per row to answer a question the pane
	 * already knows the answer to.
	 */
	readonly timeZone: string;
}) {
	const date = collectionEffectiveDate(collection, timeZone);
	const isPending = isPendingCollection(collection);
	const totals = useMemo(() => specimenTotals(collection.species), [collection.species]);

	return (
		<li>
			<Collapsible>
				<CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
					<ChevronRightIcon
						aria-hidden="true"
						className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90 motion-reduce:transition-none"
					/>
					<span className="w-24 shrink-0 font-medium text-foreground text-sm tabular-nums">
						{date === null ? '—' : formatWeekdayMonthDay(date)}
					</span>
					<CollectionFlagBadges
						className="flex min-w-0 flex-wrap items-center gap-1.5"
						collection={collection}
					/>
					<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
						{summaryLabel(collection, totals)}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="grid gap-3 border-border/40 border-t bg-muted/20 px-4 py-3">
						<CollectionSpecies
							isPending={isPending}
							isZeroResult={collection.isZeroResult}
							nameById={speciesNameById}
							species={collection.species}
						/>
						<Link
							className="inline-flex w-fit items-center gap-1.5 rounded-sm font-medium text-muted-foreground text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							params={{ id: collection.id }}
							to="/adult-surveillance/collections/$id"
						>
							Open collection record
							<ArrowRightIcon aria-hidden="true" className="size-3.5" />
						</Link>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}

function CollectionSpecies({
	species,
	isPending,
	isZeroResult,
	nameById,
}: {
	readonly species: readonly DirectorySpecies[];
	readonly isPending: boolean;
	readonly isZeroResult: boolean;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	// Most numerous first: what the trap caught most of is the finding, and a
	// catalog-alphabetical list buries it behind whatever starts with an A.
	const entries = useMemo(
		() =>
			[...species].sort((first, second) => {
				if (second.count !== first.count) {
					return second.count - first.count;
				}
				return (nameById.get(first.speciesId) ?? '').localeCompare(
					nameById.get(second.speciesId) ?? '',
				);
			}),
		[species, nameById],
	);

	if (isPending) {
		return (
			<SpeciesNote>
				This trap is still out. Its specimens are recorded once it is collected.
			</SpeciesNote>
		);
	}
	if (isZeroResult) {
		return <SpeciesNote>Marked zero result — nothing was collected.</SpeciesNote>;
	}
	if (entries.length === 0) {
		return <SpeciesNote>No species have been identified in this collection.</SpeciesNote>;
	}

	return (
		<div className="overflow-hidden rounded-md border border-border/40 bg-background">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="min-w-[11rem]">Species</TableHead>
						<TableHead className="w-[7rem]">Sex</TableHead>
						<TableHead className="w-[8rem]">Status</TableHead>
						<TableHead className="w-[6rem] text-right">Count</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{entries.map((entry) => (
						<TableRow key={entry.id}>
							<TableCell>
								{/* Binomials read italic wherever they appear in the app. */}
								<span className="italic">{nameById.get(entry.speciesId) ?? 'Unknown species'}</span>
							</TableCell>
							<TableCell>
								{entry.sex === null ? (
									<span className="text-muted-foreground text-xs">Unsexed</span>
								) : (
									<SpeciesSexBadge sex={entry.sex} />
								)}
							</TableCell>
							<TableCell>
								{entry.status === null ? (
									<span className="text-muted-foreground text-xs">Not recorded</span>
								) : (
									<SpeciesStatusBadge status={entry.status} />
								)}
							</TableCell>
							<TableCell className="text-right font-medium tabular-nums">
								{entry.count.toLocaleString()}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function SpeciesNote({ children }: { readonly children: string }) {
	return <p className="m-0 text-muted-foreground text-sm">{children}</p>;
}

function HistoryMessage({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[160px] border border-border/40 bg-muted/20">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CollectionIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
