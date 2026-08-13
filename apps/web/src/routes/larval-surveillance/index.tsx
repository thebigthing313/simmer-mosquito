import type { HabitatTypeRow, LarvalDensity, ProfileRow } from '@simmer-mosquito/sync';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	AlertTriangleIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Suspense, useMemo, useState } from 'react';
import {
	DensityBadge,
	hasAnyLifeStage,
	LifeStageStrip,
	WetnessBadge,
} from '../../components/larval-display';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { adhocLabel, formatCoordinates } from '../../lib/coordinate-label';
import { webCollections } from '../../sync/webCollections';
import type { InspectionsSearch } from './-inspections-search';
import {
	ACTIVITY_WINDOW_DAYS,
	type ActivityInspection,
	addDaysToDateString,
	buildWeek,
	dayOfMonth,
	formatMonthDay,
	type SpeciesTotal,
	startOfWeek,
	todayInTimeZone,
	useHabitatNames,
	useInspectionsForDay,
	useRecentInspections,
	useSamplesAwaiting,
	useSpeciesComposition,
	weekdayLabel,
} from './-overview-data';

const LarvalIcon = iconRegistry.domains.larvalSurveillance.icon;
const InspectionIcon = iconRegistry.entities.inspection.icon;
const SampleIcon = iconRegistry.entities.sample.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;
const MapViewIcon = iconRegistry.generic.map.icon;

/**
 * A compact panel-header action that deep-links to the inspections explorer with
 * a preset filter state, so a summary panel can hand its exact slice off to the
 * map for spatial review. The `search` is validated by the explorer route's
 * schema on arrival.
 */
function MapPreviewLink({
	search,
	label,
}: {
	readonly search: InspectionsSearch;
	readonly label: string;
}) {
	return (
		<Button aria-label={label} asChild className="size-8" size="icon" title={label} variant="ghost">
			<Link search={search} to="/larval-surveillance/inspections">
				<MapViewIcon aria-hidden="true" className="size-4" />
			</Link>
		</Button>
	);
}

export const Route = createFileRoute('/larval-surveillance/')({
	component: LarvalSurveillanceOverviewRoute,
});

function LarvalSurveillanceOverviewRoute() {
	return (
		<div className={pageContainer({ gap: 'overview', padding: 'page' })}>
			<header className="grid gap-1.5">
				<div className="flex items-center gap-2 text-muted-foreground">
					<LarvalIcon aria-hidden="true" className="size-4" />
					<span className="font-medium text-xs uppercase tracking-wide">
						Surveillance &amp; mapping
					</span>
				</div>
				<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
					Larval Surveillance
				</h1>
				<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
					Inspection activity across your habitats, the species your samples identified, and the
					habitats where larval density came back heavy.
				</p>
			</header>

			<Suspense fallback={<OverviewSkeleton />}>
				<OverviewBody />
			</Suspense>
		</div>
	);
}

function OverviewBody() {
	// Local-timezone "today"; the day strip and windows are pure string math from here.
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const since = useMemo(() => addDaysToDateString(today, -(ACTIVITY_WINDOW_DAYS - 1)), [today]);

	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);

	const profileNameById = useMemo(
		() => new Map(profiles.map((profile) => [profile.id, profile.displayName] as const)),
		[profiles],
	);
	const typeNameById = useMemo(
		() => new Map(habitatTypes.map((type) => [type.id, type.name] as const)),
		[habitatTypes],
	);

	return (
		<div className="grid gap-5 xl:grid-cols-12">
			<div className="xl:col-span-7">
				<DailyInspectionsPanel
					profileNameById={profileNameById}
					today={today}
					typeNameById={typeNameById}
				/>
			</div>

			<div className="grid content-start gap-5 xl:col-span-5">
				<SpeciesCompositionPanel today={today} />
				<OpenSamplesPanel since={since} />
			</div>

			<div className="xl:col-span-12">
				<HeavyInspectionsPanel since={since} today={today} typeNameById={typeNameById} />
			</div>
		</div>
	);
}

interface ResolvedRow {
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly typeName: string | null;
	/** `34.05213, -118.24368` — how an ad-hoc inspection identifies itself. */
	readonly coordinates: string | null;
}

type Resolver = (inspection: ActivityInspection) => ResolvedRow;

/**
 * Build a row resolver for a set of inspections: habitat names come from the POST
 * `by-ids` lookup over just these inspections' habitats, type names from the eager
 * catalog. Each panel resolves its own set, so a day the user browses to resolves
 * its own habitats without a shared window.
 */
function useResolver(
	inspections: readonly ActivityInspection[],
	typeNameById: ReadonlyMap<string, string>,
): Resolver {
	const habitatIds = useMemo(
		() =>
			inspections
				.map((inspection) => inspection.habitatId)
				.filter((id): id is string => id !== null),
		[inspections],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	return useMemo(
		() =>
			(inspection: ActivityInspection): ResolvedRow => ({
				habitatId: inspection.habitatId,
				habitatName:
					inspection.habitatId === null
						? null
						: (habitatNameById.get(inspection.habitatId) ?? null),
				typeName:
					inspection.habitatTypeId === null
						? null
						: (typeNameById.get(inspection.habitatTypeId) ?? 'Unknown type'),
				coordinates: formatCoordinates(inspection.lat, inspection.lng),
			}),
		[habitatNameById, typeNameById],
	);
}

/**
 * What names an inspection's site. An ad-hoc inspection has no habitat, so it is
 * titled by its coordinates instead — "Ad-hoc inspection" named the category
 * every such row already belonged to, leaving nothing to tell one row from the
 * next.
 */
function siteName(row: ResolvedRow): string {
	if (row.habitatId === null) {
		return row.coordinates ?? 'Ad-hoc inspection';
	}
	return row.habitatName ?? `Habitat ${row.habitatId.slice(0, 8)}`;
}

/** Habitat name as a link to the habitat, for panels that list a day's work. */
function HabitatLink({ row }: { readonly row: ResolvedRow }) {
	const label = siteName(row);
	if (row.habitatId === null) {
		return (
			<span className="truncate font-medium text-foreground text-sm tabular-nums">{label}</span>
		);
	}
	return (
		<Link
			className="truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			params={{ id: row.habitatId }}
			to="/larval-surveillance/habitats/$id"
		>
			{label}
		</Link>
	);
}

// --- daily inspections ------------------------------------------------------

interface InspectorGroup {
	readonly key: string;
	readonly name: string;
	readonly rows: readonly ActivityInspection[];
}

const UNASSIGNED_KEY = '__unassigned__';

function groupByInspector(
	inspections: readonly ActivityInspection[],
	profileNameById: ReadonlyMap<string, string>,
): readonly InspectorGroup[] {
	const groups = new Map<string, ActivityInspection[]>();
	for (const inspection of inspections) {
		const key = inspection.inspectedByProfileId ?? UNASSIGNED_KEY;
		const existing = groups.get(key);
		if (existing) {
			existing.push(inspection);
		} else {
			groups.set(key, [inspection]);
		}
	}
	return [...groups.entries()]
		.map(([key, rows]) => ({
			key,
			name:
				key === UNASSIGNED_KEY ? 'Unassigned' : (profileNameById.get(key) ?? 'Unknown inspector'),
			rows,
		}))
		.sort((first, second) => {
			if (first.key === UNASSIGNED_KEY) {
				return 1;
			}
			if (second.key === UNASSIGNED_KEY) {
				return -1;
			}
			return first.name.localeCompare(second.name);
		});
}

function DailyInspectionsPanel({
	profileNameById,
	typeNameById,
	today,
}: {
	readonly profileNameById: ReadonlyMap<string, string>;
	readonly typeNameById: ReadonlyMap<string, string>;
	readonly today: string;
}) {
	const [selectedDate, setSelectedDate] = useState(today);
	const { inspections, isReady, isError } = useInspectionsForDay(selectedDate);
	const resolve = useResolver(inspections, typeNameById);

	const groups = useMemo(
		() => groupByInspector(inspections, profileNameById),
		[inspections, profileNameById],
	);

	const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
	const days = useMemo(() => buildWeek(weekStart), [weekStart]);
	// The current week is the latest browsable one; there is no future data.
	const canGoNextWeek = weekStart < startOfWeek(today);

	const goToWeek = (deltaDays: number) => {
		const shifted = addDaysToDateString(selectedDate, deltaDays);
		setSelectedDate(shifted > today ? today : shifted);
	};

	return (
		<Panel
			actions={
				<MapPreviewLink
					label={`View ${formatMonthDay(selectedDate)} inspections on the map`}
					search={{ from: selectedDate, to: selectedDate }}
				/>
			}
			count={isReady ? inspections.length : undefined}
			icon={<InspectionIcon className="size-4" />}
			title="Daily Inspections"
		>
			<div className="flex items-stretch gap-1 border-border/60 border-b p-3">
				<Button
					aria-label="Previous week"
					className="size-auto shrink-0 px-1.5"
					onClick={() => goToWeek(-7)}
					size="icon"
					variant="outline"
				>
					<ChevronLeftIcon aria-hidden="true" className="size-4" />
				</Button>
				<div className="grid flex-1 grid-cols-7 gap-1">
					{days.map((day) => {
						const isSelected = day === selectedDate;
						const isToday = day === today;
						const isFuture = day > today;
						return (
							<button
								className={cn(
									'flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-xs transition-colors',
									isSelected
										? 'border-primary bg-primary text-primary-foreground'
										: isFuture
											? 'cursor-not-allowed border-border/40 text-muted-foreground/40'
											: 'border-border hover:bg-accent',
								)}
								disabled={isFuture}
								key={day}
								onClick={() => setSelectedDate(day)}
								type="button"
							>
								<span className="text-[0.62rem] uppercase tracking-wide opacity-70">
									{isToday ? 'Today' : weekdayLabel(day)}
								</span>
								<span className="font-semibold tabular-nums">{dayOfMonth(day)}</span>
							</button>
						);
					})}
				</div>
				<Button
					aria-label="Next week"
					className="size-auto shrink-0 px-1.5"
					disabled={!canGoNextWeek}
					onClick={() => goToWeek(7)}
					size="icon"
					variant="outline"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Button>
			</div>

			{isError ? (
				<PanelMessage>Inspection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton />
			) : groups.length === 0 ? (
				<PanelMessage>No inspections recorded on this day.</PanelMessage>
			) : (
				// A busy day can hold hundreds of inspections; keep the panel a fixed,
				// internally scrolling height so the page stays balanced beside the
				// shorter right column instead of stretching to full document length.
				<div className="max-h-[32rem] divide-y divide-border/60 overflow-y-auto">
					{groups.map((group) => (
						<InspectorGroupBlock group={group} key={group.key} resolve={resolve} />
					))}
				</div>
			)}
		</Panel>
	);
}

/**
 * One inspector's day, collapsed to a single summary row until opened.
 *
 * A crew of six working a heavy day puts several hundred rows in this panel, and
 * every one of them had to be scrolled past to reach the next inspector. Closed,
 * the row answers the question the panel is usually asked — how much each person
 * got through, and how much of it came back breeding-positive.
 */
function InspectorGroupBlock({
	group,
	resolve,
}: {
	readonly group: InspectorGroup;
	readonly resolve: Resolver;
}) {
	const [open, setOpen] = useState(false);
	const PersonnelIcon = iconRegistry.entities.organization.icon;
	const positiveCount = group.rows.filter(
		(inspection) => inspection.isWet && hasAnyLifeStage(inspection),
	).length;

	return (
		<Collapsible asChild onOpenChange={setOpen} open={open}>
			<section>
				<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
					{open ? (
						<ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<ChevronRightIcon
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
					)}
					<PersonnelIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
					<span
						className={cn(
							'min-w-0 flex-1 truncate font-medium text-sm',
							group.key === UNASSIGNED_KEY && 'text-muted-foreground italic',
						)}
					>
						{group.name}
					</span>
					{positiveCount > 0 ? (
						<Badge tone="danger" variant="outline">
							{positiveCount} positive
						</Badge>
					) : null}
					<span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
						{group.rows.length}
					</span>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<ul className="grid px-3 pb-3">
						{group.rows.map((inspection) => (
							<InspectionRow
								inspection={inspection}
								key={inspection.id}
								row={resolve(inspection)}
							/>
						))}
					</ul>
				</CollapsibleContent>
			</section>
		</Collapsible>
	);
}

function InspectionRow({
	inspection,
	row,
}: {
	readonly inspection: ActivityInspection;
	readonly row: ResolvedRow;
}) {
	return (
		<li className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/40">
			<div className="grid min-w-0 flex-1">
				<HabitatLink row={row} />
				<span className="truncate text-muted-foreground text-xs">
					{row.typeName ?? 'Unassigned type'}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{inspection.isWet ? (
					<DensityBadge density={inspection.density} />
				) : (
					<WetnessBadge isWet={false} />
				)}
				{inspection.isWet && hasAnyLifeStage(inspection) ? (
					<LifeStageStrip size="sm" stages={inspection} />
				) : null}
			</div>
		</li>
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
	const { totals, grandTotal, isReady, isError } = useSpeciesComposition(since);

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
					No larvae identified in the last {window === '7d' ? '7' : '30'} days.
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

// --- open samples -----------------------------------------------------------

function OpenSamplesPanel({ since }: { readonly since: string }) {
	// Resolved server-side (see useSamplesAwaiting): the awaiting set spans every
	// habitat in the window, so it can't be gathered by a bounded client include.
	const { samples, total, isLoading, isError } = useSamplesAwaiting(since);

	return (
		<Panel
			count={isError || isLoading ? undefined : total}
			footer={
				total > 0 ? (
					<Link
						className="font-medium text-primary hover:underline"
						to="/larval-surveillance/samples"
					>
						View all samples
					</Link>
				) : undefined
			}
			icon={<SampleIcon className="size-4" />}
			title="Awaiting Identification"
		>
			{isError ? (
				<PanelMessage>Sample data is unavailable right now.</PanelMessage>
			) : isLoading ? (
				<RowSkeleton count={3} />
			) : samples.length === 0 ? (
				<PanelMessage>No samples awaiting identification — nice work.</PanelMessage>
			) : (
				<ul className="divide-y divide-border/60">
					{samples.map((sample) => (
						<li className="flex items-center gap-3 px-4 py-2.5" key={sample.id}>
							<div className="grid min-w-0 flex-1">
								<Link
									className="truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									params={{ id: sample.id }}
									to="/larval-surveillance/samples/$id"
								>
									{sample.displayName?.trim() || `Sample ${sample.id.slice(0, 8)}`}
								</Link>
								<span className="truncate text-muted-foreground text-xs tabular-nums">
									{sample.habitatName ??
										(sample.habitatId === null ? adhocLabel(sample.lat, sample.lng) : 'Habitat')}
								</span>
							</div>
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatMonthDay(sample.inspectionDate)}
							</span>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

// --- heavy / very heavy -----------------------------------------------------

function isHot(density: LarvalDensity | null): boolean {
	return density === 'heavy' || density === 'very_heavy';
}

function HeavyInspectionsPanel({
	since,
	today,
	typeNameById,
}: {
	readonly since: string;
	readonly today: string;
	readonly typeNameById: ReadonlyMap<string, string>;
}) {
	const { inspections, isReady, isError } = useRecentInspections(since);

	// Inspections arrive newest-first from the query; keep that order. Resolve
	// habitat names for only the heavy rows shown — resolving the whole 14-day set
	// would overflow the by-ids cap and drop names for the rows that matter.
	const hot = useMemo(
		() => inspections.filter((inspection) => isHot(inspection.density)),
		[inspections],
	);
	const resolve = useResolver(hot, typeNameById);

	return (
		<Panel
			actions={
				<MapPreviewLink
					label="View heavy & very heavy inspections on the map"
					search={{ from: since, to: today, density: ['heavy', 'very_heavy'] }}
				/>
			}
			count={isReady ? hot.length : undefined}
			icon={<AlertTriangleIcon className="size-4" />}
			title={`Heavy & Very Heavy · Last ${ACTIVITY_WINDOW_DAYS} Days`}
		>
			{isError ? (
				<PanelMessage>Inspection activity is unavailable right now.</PanelMessage>
			) : !isReady ? (
				<RowSkeleton count={3} />
			) : hot.length === 0 ? (
				<PanelMessage>
					No heavy or very heavy inspections in the last {ACTIVITY_WINDOW_DAYS} days.
				</PanelMessage>
			) : (
				<ul className="grid gap-1 p-2 sm:grid-cols-2">
					{hot.map((inspection) => {
						const row = resolve(inspection);
						return (
							<li
								className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40"
								key={inspection.id}
							>
								<span className="w-11 shrink-0 text-muted-foreground text-xs tabular-nums">
									{formatMonthDay(inspection.inspectionDate)}
								</span>
								{/*
								 * The reason to look at this panel is to open the inspection that
								 * came back heavy, so the row's body goes there rather than to the
								 * habitat — the habitat is one hop further on from the inspection.
								 */}
								<Link
									className="group grid min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									params={{ id: inspection.id }}
									to="/larval-surveillance/inspections/$id"
								>
									<span className="truncate font-medium text-foreground text-sm tabular-nums group-hover:text-primary">
										{siteName(row)}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{row.typeName ?? 'Unassigned type'}
									</span>
								</Link>
								<div className="flex shrink-0 items-center gap-2">
									<DensityBadge density={inspection.density} />
									{hasAnyLifeStage(inspection) ? (
										<LifeStageStrip size="sm" stages={inspection} />
									) : null}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</Panel>
	);
}

// --- loading skeleton for the whole body ------------------------------------

function OverviewSkeleton() {
	return (
		<div aria-hidden="true" className="grid gap-5 xl:grid-cols-12">
			<Skeleton className="h-96 rounded-lg xl:col-span-7" />
			<div className="grid content-start gap-5 xl:col-span-5">
				<Skeleton className="h-48 rounded-lg" />
				<Skeleton className="h-48 rounded-lg" />
			</div>
			<Skeleton className="h-40 rounded-lg xl:col-span-12" />
		</div>
	);
}
