import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { AlertTriangleIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { trapDisplayName } from '../../hooks/queries/trap-view';
import {
	type SpeciesTotal,
	useAdultSpeciesComposition,
} from '../../hooks/queries/use-adult-species-composition';
import { useCollectionsAwaitingIdentification } from '../../hooks/queries/use-collections-awaiting-identification';
import { useCollectionsOverThreshold } from '../../hooks/queries/use-collections-over-threshold';
import {
	type ActivityCollection,
	useRecentCollections,
} from '../../hooks/queries/use-recent-collections';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { CollectionFlagBadges, collectionEffectiveDate } from './-adult-display';
import {
	ADULT_ACTIVITY_WINDOW_DAYS,
	addDaysToDateString,
	formatMonthDay,
	formatWeekdayMonthDay,
	todayInTimeZone,
} from './-overview-data';

const AdultIcon = iconRegistry.domains.adultSurveillance.icon;
const TrapIcon = iconRegistry.entities.trap.icon;
const CollectionIcon = iconRegistry.entities.collection.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

export const Route = createFileRoute('/adult-surveillance/')({
	component: AdultSurveillanceOverviewRoute,
});

function AdultSurveillanceOverviewRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const since = useMemo(
		() => addDaysToDateString(today, -(ADULT_ACTIVITY_WINDOW_DAYS - 1)),
		[today],
	);

	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<header className="grid gap-1.5">
				<div className="flex items-center gap-2 text-muted-foreground">
					<AdultIcon aria-hidden="true" className="size-4" />
					<span className="font-medium text-xs uppercase tracking-wide">
						Surveillance &amp; mapping
					</span>
				</div>
				<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Adult Surveillance
				</h1>
				<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
					Collection activity across your traps, the species composition in what they caught, and
					the collections still awaiting identification or flagged with a problem.
				</p>
			</header>

			<div className="grid gap-5 xl:grid-cols-12">
				<div className="xl:col-span-7">
					<RecentCollectionsPanel since={since} />
				</div>
				<div className="grid content-start gap-5 xl:col-span-5">
					<SpeciesCompositionPanel today={today} />
					<AwaitingIdentificationPanel since={since} />
				</div>
				<div className="xl:col-span-12">
					<OverThresholdPanel since={since} />
				</div>
				<div className="xl:col-span-12">
					<AttentionPanel since={since} />
				</div>
			</div>
		</div>
	);
}

/** What a collection is called: the trap it came from, or that it had none. */
function collectionPrimaryLabel(collection: {
	readonly trapId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
}): string {
	if (collection.trapId === null) {
		return 'Ad-hoc collection';
	}
	return trapDisplayName({
		id: collection.trapId,
		trapName: collection.trapName,
		trapCode: collection.trapCode,
	});
}

/** A collection's date as `Wed, Aug 12` — an em dash while it is still pending. */
function collectionDayLabel(
	collection: {
		readonly collectedAt: Date | null;
		readonly collectionDate: string | null;
	},
	timeZone: string,
): string {
	return formatWeekdayMonthDay(collectionEffectiveDate(collection, timeZone) ?? '');
}

function CollectionLink({
	id,
	label,
	className,
}: {
	readonly id: string;
	readonly label: string;
	readonly className?: string;
}) {
	return (
		<Link
			className={cn(cn(recordLink({ size: 'sm' }), 'truncate'), className)}
			params={{ id }}
			to="/adult-surveillance/collections/$id"
		>
			{label}
		</Link>
	);
}

// --- recent collections (grouped by day) ------------------------------------

interface DayGroup {
	readonly day: string;
	readonly rows: readonly ActivityCollection[];
}

function groupByDay(
	collections: readonly ActivityCollection[],
	timeZone: string,
): readonly DayGroup[] {
	const groups = new Map<string, ActivityCollection[]>();
	for (const collection of collections) {
		const day = collectionEffectiveDate(collection, timeZone) ?? '';
		if (day === '') {
			continue;
		}
		const existing = groups.get(day);
		if (existing) {
			existing.push(collection);
		} else {
			groups.set(day, [collection]);
		}
	}
	// The rows arrive sorted newest-first, so day keys do too.
	return [...groups.entries()].map(([day, rows]) => ({ day, rows }));
}

function RecentCollectionsPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { collections, isReady, isError } = useRecentCollections(since, timeZone);
	const groups = useMemo(() => groupByDay(collections, timeZone), [collections, timeZone]);

	return (
		<Panel
			count={isReady ? collections.length : undefined}
			icon={<CollectionIcon className="size-4" />}
			title={`Recent Collections · Last ${ADULT_ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Collection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton />
			) : groups.length === 0 ? (
				<PanelMessage>
					No collections retrieved in the last {ADULT_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<div className="max-h-[32rem] divide-y divide-border/60 overflow-y-auto">
					{groups.map((group) => (
						<DayGroupBlock group={group} key={group.day} />
					))}
				</div>
			)}
		</Panel>
	);
}

function DayGroupBlock({ group }: { readonly group: DayGroup }) {
	return (
		<section className="p-3">
			<div
				className={cn(
					stickyHeader({ surface: 'card', layout: 'inline', gap: 'tight', padding: 'tight' }),
					'mb-1',
				)}
			>
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					{formatMonthDay(group.day)}
				</span>
				<span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
					{group.rows.length}
				</span>
			</div>
			<ul className="grid">
				{group.rows.map((collection) => (
					<li
						className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/40"
						key={collection.id}
					>
						<div className="grid min-w-0 flex-1">
							<CollectionLink id={collection.id} label={collectionPrimaryLabel(collection)} />
							<span className="truncate text-muted-foreground text-xs">
								{collection.methodName}
								{collection.collectedByProfileId === null
									? ''
									: ` · ${collection.collectedByName ?? 'Unknown'}`}
							</span>
						</div>
						<CollectionFlagBadges
							className="flex shrink-0 items-center gap-1.5"
							collection={collection}
						/>
					</li>
				))}
			</ul>
		</section>
	);
}

// --- species composition ----------------------------------------------------

const SPECIES_PREVIEW_COUNT = 6;
type SpeciesWindow = '7d' | '30d';

function SpeciesCompositionPanel({ today }: { readonly today: string }) {
	const [window, setWindow] = useState<SpeciesWindow>('7d');
	const since = useMemo(
		() => addDaysToDateString(today, window === '7d' ? -6 : -29),
		[today, window],
	);
	const { totals, grandTotal, isReady, isError } = useAdultSpeciesComposition(since);

	const { top, otherTotal, otherCount, maxBar } = useMemo(() => {
		const previewed = totals.slice(0, SPECIES_PREVIEW_COUNT);
		const rest = totals.slice(SPECIES_PREVIEW_COUNT);
		return {
			top: previewed,
			otherTotal: rest.reduce((sum, entry) => sum + entry.total, 0),
			otherCount: rest.length,
			maxBar: previewed[0]?.total ?? 1,
		};
	}, [totals]);

	return (
		<Panel
			actions={
				<ToggleGroup
					aria-label="Species window"
					className="h-8"
					onValueChange={(next) => next && setWindow(next as SpeciesWindow)}
					size="sm"
					type="single"
					value={window}
					variant="outline"
				>
					<ToggleGroupItem className="h-8 px-2.5 text-xs" value="7d">
						7d
					</ToggleGroupItem>
					<ToggleGroupItem className="h-8 px-2.5 text-xs" value="30d">
						30d
					</ToggleGroupItem>
				</ToggleGroup>
			}
			icon={<SpeciesIcon className="size-4" />}
			title="Species Composition"
		>
			{isError ? (
				<PanelMessage>Species data is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={5} />
			) : top.length === 0 ? (
				<PanelMessage>
					No specimens identified in the last {window === '7d' ? '7' : '30'} days.
				</PanelMessage>
			) : (
				<div className="grid gap-2.5 p-4">
					{top.map((entry) => (
						<SpeciesBar
							barWidth={(entry.total / maxBar) * 100}
							entry={entry}
							key={entry.speciesId}
							percent={grandTotal === 0 ? 0 : (entry.total / grandTotal) * 100}
						/>
					))}
					{otherTotal > 0 ? (
						<SpeciesBar
							barWidth={(otherTotal / maxBar) * 100}
							entry={{ speciesId: '__other__', name: `Other (${otherCount})`, total: otherTotal }}
							muted
							percent={grandTotal === 0 ? 0 : (otherTotal / grandTotal) * 100}
						/>
					) : null}
				</div>
			)}
		</Panel>
	);
}

function SpeciesBar({
	entry,
	percent,
	barWidth,
	muted = false,
}: {
	readonly entry: SpeciesTotal;
	readonly percent: number;
	readonly barWidth: number;
	readonly muted?: boolean;
}) {
	return (
		<div className="grid gap-1">
			<div className="flex items-baseline justify-between gap-2 text-sm">
				<span
					className={cn('truncate', muted ? 'text-muted-foreground' : 'text-foreground italic')}
				>
					{entry.name}
				</span>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{entry.total.toLocaleString()} · {percent.toFixed(0)}%
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className={cn('h-full rounded-full', muted ? 'bg-muted-foreground/40' : 'bg-primary')}
					style={{ width: `${Math.max(barWidth, 2)}%` }}
				/>
			</div>
		</div>
	);
}

// --- awaiting identification -------------------------------------------------

function AwaitingIdentificationPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { awaiting, isReady, isError } = useCollectionsAwaitingIdentification(since, timeZone);

	return (
		<Panel
			count={isReady ? awaiting.length : undefined}
			footer={
				awaiting.length > 0 ? (
					<Link
						className="font-medium text-primary hover:underline"
						to="/adult-surveillance/collections"
					>
						View all collections
					</Link>
				) : undefined
			}
			icon={<SpeciesIcon className="size-4" />}
			title="Awaiting Identification"
		>
			{isError ? (
				<PanelMessage>Collection data is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : awaiting.length === 0 ? (
				<PanelMessage>No collections awaiting identification — nice work.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{awaiting.map((collection) => (
						<li className="flex items-center gap-3 px-4 py-2.5" key={collection.id}>
							<div className="grid min-w-0 flex-1">
								<CollectionLink id={collection.id} label={collectionPrimaryLabel(collection)} />
								<span className="truncate text-muted-foreground text-xs">
									{collection.methodName}
								</span>
							</div>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{collectionDayLabel(collection, timeZone)}
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- over action threshold --------------------------------------------------

function OverThresholdPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { collections, hasConfiguredThresholds, isReady, isError } = useCollectionsOverThreshold(
		since,
		timeZone,
	);

	return (
		<Panel
			count={isReady ? collections.length : undefined}
			icon={<AlertTriangleIcon className="size-4" />}
			title={`Over Action Threshold · Last ${ADULT_ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Collection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : !hasConfiguredThresholds ? (
				// Distinct from the empty list below it. Without this an unset threshold
				// reads as a quiet fortnight.
				<PanelMessage>
					No collection method sets an action threshold.{' '}
					<Link
						className="font-medium text-primary hover:underline"
						to="/adult-surveillance/collection-methods"
					>
						Set one
					</Link>
					.
				</PanelMessage>
			) : collections.length === 0 ? (
				<PanelMessage>
					No collection reached its method's action threshold in the last{' '}
					{ADULT_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="grid gap-1 p-2 sm:grid-cols-2">
					{collections.map((collection) => (
						<li
							className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
							key={collection.id}
						>
							<span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatMonthDay(collectionEffectiveDate(collection, timeZone) ?? '')}
							</span>
							{/*
							 * The reason to read this panel is to open the collection that ran
							 * hot, so the row's body goes there rather than to the trap.
							 */}
							<Link
								className="group grid min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: collection.id }}
								to="/adult-surveillance/collections/$id"
							>
								<span className="truncate font-medium text-foreground text-sm group-hover:text-primary">
									{collectionPrimaryLabel(collection)}
								</span>
								<span className="truncate text-muted-foreground text-xs">
									{collection.methodName}
								</span>
							</Link>
							<span className="shrink-0 text-sm tabular-nums">
								{/* A slash reads as nothing aloud, so the pair is spelled out. */}
								<span className="sr-only">
									{collection.total.toLocaleString()} of a threshold of{' '}
									{collection.actionThreshold.toLocaleString()}
								</span>
								<span aria-hidden="true" className="font-medium text-foreground">
									{collection.total.toLocaleString()}
								</span>
								<span aria-hidden="true" className="text-muted-foreground">
									{' / '}
									{collection.actionThreshold.toLocaleString()}
								</span>
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- attention (problem collections) ----------------------------------------

function AttentionPanel({ since }: { readonly since: string }) {
	const timeZone = useOrganizationTimeZone();
	const { collections, isReady, isError } = useRecentCollections(since, timeZone);
	const flagged = useMemo(
		() => collections.filter((collection) => collection.hasProblem),
		[collections],
	);

	return (
		<Panel
			count={isReady ? flagged.length : undefined}
			icon={<AlertTriangleIcon className="size-4" />}
			title={`Flagged for Attention · Last ${ADULT_ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Collection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : flagged.length === 0 ? (
				<PanelMessage>
					No collections were flagged with a problem in the last {ADULT_ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="grid gap-1 p-2 sm:grid-cols-2">
					{flagged.map((collection) => (
						<li
							className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
							key={collection.id}
						>
							<TrapIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
							<div className="grid min-w-0 flex-1">
								<CollectionLink id={collection.id} label={collectionPrimaryLabel(collection)} />
								<span className="truncate text-muted-foreground text-xs">
									{collection.methodName}
								</span>
							</div>
							<span className="w-11 shrink-0 text-right text-muted-foreground text-xs tabular-nums">
								{collectionDayLabel(collection, timeZone)}
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}
