import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { AlertTriangleIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Suspense, useState } from 'react';
import {
	DensityBadge,
	hasAnyLifeStage,
	LifeStageStrip,
	WetnessBadge,
} from '../../components/larval-display';
import type { InspectionsSearch } from '../../components/larval-surveillance/inspections-search';
import { PersonGroupBlock } from '../../components/person-group-block';
import {
	SPECIES_WINDOWS,
	SpeciesCompositionPanel,
	type SpeciesWindow,
	speciesWindowSince,
} from '../../components/species-composition-panel';
import { WeekDayStrip } from '../../components/week-day-strip';
import { useSamplesAwaiting } from '../../hooks/larval-surveillance/use-samples-awaiting';
import { useSpeciesComposition } from '../../hooks/larval-surveillance/use-species-composition';
import {
	inspectionHabitatLabel,
	inspectionTypeLabel,
	type LarvalActivityRow,
} from '../../hooks/queries/larval-activity-view';
import { useHeavyLarvalActivity } from '../../hooks/queries/use-heavy-larval-activity';
import { useLarvalActivityForDate } from '../../hooks/queries/use-larval-activity-for-date';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { habitatLabel } from '../../lib/coordinate-label';
import { addDaysToDateString, formatMonthDay, todayInTimeZone } from '../../lib/local-date';
import { groupRows, type RowGroup } from '../../lib/row-groups';

/** How far back the recent-window queries (heavy list, open samples) reach. */
const ACTIVITY_WINDOW_DAYS = 14;

/** Both inspection panels read the same activity, so a failure says the same thing. */
const INSPECTIONS_UNAVAILABLE = { description: 'Inspection activity is unavailable right now.' };

const LarvalIcon = iconRegistry.domains.larvalSurveillance.icon;
const InspectionIcon = iconRegistry.entities.inspection.icon;
const SampleIcon = iconRegistry.entities.sample.icon;
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
	// `record` is the measure the route-loading skeleton reserves, so the
	// overview arrives at the width it stood in for (#1043, #1049). The panels
	// keep their twelve-column grid; the frame is what widened.
	return (
		<div className={pageContainer({ gap: 'overview', measure: 'record', padding: 'page' })}>
			<PageHeader icon={LarvalIcon} title="Larval Surveillance" />

			<Suspense fallback={<OverviewSkeleton />}>
				<OverviewBody />
			</Suspense>
		</div>
	);
}

function OverviewBody() {
	// The organization's "today"; the day strip and windows are pure string math
	// from here.
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const since = addDaysToDateString(today, -(ACTIVITY_WINDOW_DAYS - 1));

	return (
		<div className="grid gap-5 xl:grid-cols-12">
			<div className="xl:col-span-7">
				<DailyInspectionsPanel today={today} />
			</div>

			<div className="grid content-start gap-5 xl:col-span-5">
				<LarvalSpeciesComposition today={today} />
				<OpenSamplesPanel since={since} />
			</div>

			<div className="xl:col-span-12">
				<HeavyInspectionsPanel since={since} today={today} />
			</div>
		</div>
	);
}

/** Habitat name as a link to the habitat, for panels that list a day's work. */
function HabitatLink({ row }: { readonly row: LarvalActivityRow }) {
	const label = inspectionHabitatLabel(row);
	if (row.habitatId === null) {
		return (
			<span className="truncate font-medium text-foreground text-sm tabular-nums">{label}</span>
		);
	}
	return (
		<Link
			className={cn(recordLink({ size: 'sm' }), 'truncate')}
			params={{ id: row.habitatId }}
			to="/larval-surveillance/habitats/$id"
		>
			{label}
		</Link>
	);
}

// --- daily inspections ------------------------------------------------------

/** A day's inspections by the person who made them, the unassigned ones last. */
function groupByInspector(inspections: readonly LarvalActivityRow[]) {
	return groupRows(inspections, {
		key: (inspection) => inspection.inspectedByProfileId,
		name: (inspection) => inspection.inspectedByName,
		unknownName: 'Unknown inspector',
	});
}

function DailyInspectionsPanel({ today }: { readonly today: string }) {
	const [selectedDate, setSelectedDate] = useState(today);
	// One query. Each row arrives with the site it was made at already attached, so
	// there is nothing to resolve and no second request to wait on.
	const { rows: inspections, isReady, isError } = useLarvalActivityForDate(selectedDate);

	const groups = groupByInspector(inspections);

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
			<WeekDayStrip onSelect={setSelectedDate} selectedDate={selectedDate} today={today} />

			<PanelRows
				empty={{ description: 'No inspections recorded on this day.' }}
				icon={<InspectionIcon aria-hidden="true" />}
				inset
				reading={{ isError, isReady, rows: groups }}
				unavailable={INSPECTIONS_UNAVAILABLE}
				wrap="none"
			>
				{(rows) => (
					// A busy day can hold hundreds of inspections; keep the panel a fixed,
					// internally scrolling height so the page stays balanced beside the
					// shorter right column instead of stretching to full document length.
					<div className="max-h-[32rem] divide-y divide-border/60 overflow-y-auto">
						{rows.map((group) => (
							<InspectorGroupBlock group={group} key={group.key} />
						))}
					</div>
				)}
			</PanelRows>
		</Panel>
	);
}

/**
 * One inspector's day, with how much of it came back breeding-positive.
 *
 * That count is the only thing this adds to the shared block: the question the
 * panel is usually asked is how much each person got through, and how much of
 * it was wet and holding larvae.
 */
function InspectorGroupBlock({ group }: { readonly group: RowGroup<LarvalActivityRow> }) {
	const positiveCount = group.rows.filter(
		(inspection) => inspection.isWet && hasAnyLifeStage(inspection),
	).length;

	return (
		<PersonGroupBlock
			aside={
				positiveCount > 0 ? (
					<Badge tone="warning" variant="outline">
						{positiveCount} positive
					</Badge>
				) : null
			}
			count={group.rows.length}
			groupKey={group.key}
			name={group.name}
		>
			{group.rows.map((inspection) => (
				<InspectionRow key={inspection.id} row={inspection} />
			))}
		</PersonGroupBlock>
	);
}

// One prop now: the row carries its own site, where it used to be handed the
// inspection and a separately resolved label for the same record.
function InspectionRow({ row }: { readonly row: LarvalActivityRow }) {
	return (
		<li className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/40">
			<div className="grid min-w-0 flex-1">
				<HabitatLink row={row} />
				<span className="truncate text-muted-foreground text-xs">
					{inspectionTypeLabel(row) ?? 'Unassigned type'}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{row.isWet ? <DensityBadge density={row.density} /> : <WetnessBadge isWet={false} />}
				{row.isWet && hasAnyLifeStage(row) ? <LifeStageStrip size="sm" stages={row} /> : null}
			</div>
		</li>
	);
}

// --- species composition ----------------------------------------------------

function LarvalSpeciesComposition({ today }: { readonly today: string }) {
	const [window, setWindow] = useState<SpeciesWindow>('7d');
	const { totals, grandTotal, isReady, isError } = useSpeciesComposition(
		speciesWindowSince(today, window),
	);

	return (
		<SpeciesCompositionPanel
			emptySubject="larvae"
			grandTotal={grandTotal}
			isError={isError}
			isReady={isReady}
			onWindowChange={setWindow}
			totals={totals}
			window={window}
			windows={SPECIES_WINDOWS}
		/>
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
			<PanelRows
				empty={{ description: 'No samples awaiting identification. Nice work.' }}
				icon={<SampleIcon aria-hidden="true" />}
				inset
				// The hook says `isLoading`; the reading asks the other way round.
				reading={{ isError, isReady: !isLoading, rows: samples }}
				unavailable={{ description: 'Sample data is unavailable right now.' }}
				wrap="none"
			>
				{(rows) => (
					<ul className="divide-y divide-border/60">
						{rows.map((sample) => (
							<li className="flex items-center gap-3 px-4 py-2.5" key={sample.id}>
								<div className="grid min-w-0 flex-1">
									<Link
										className={cn(recordLink({ size: 'sm' }), 'truncate')}
										params={{ id: sample.id }}
										to="/larval-surveillance/samples/$id"
									>
										{sample.displayName?.trim() || `Sample ${sample.id.slice(0, 8)}`}
									</Link>
									<span className="truncate text-muted-foreground text-xs tabular-nums">
										{sample.habitatName ??
											(sample.habitatId === null
												? habitatLabel(sample, {
														addressName: sample.addressDisplayName,
														fallback: 'One-off sample',
													})
												: 'Habitat')}
									</span>
								</div>
								<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
									{formatMonthDay(sample.inspectionDate)}
								</span>
							</li>
						))}
					</ul>
				)}
			</PanelRows>
		</Panel>
	);
}

// --- heavy / very heavy -----------------------------------------------------

function HeavyInspectionsPanel({
	since,
	today,
}: {
	readonly since: string;
	readonly today: string;
}) {
	// The density filter is in the query, so the join loads only the sites behind
	// the heavy rows. Filtering here instead would first pull every site touched in
	// the window — which is why this used to need a cap.
	const { rows: hot, isReady, isError } = useHeavyLarvalActivity(since);

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
			<PanelRows
				empty={{
					description: `No heavy or very heavy inspections in the last ${ACTIVITY_WINDOW_DAYS} days.`,
				}}
				icon={<AlertTriangleIcon aria-hidden="true" />}
				inset
				reading={{ isError, isReady, rows: hot }}
				unavailable={INSPECTIONS_UNAVAILABLE}
				wrap="none"
			>
				{(rows) => (
					<ul className="grid gap-1 p-2 sm:grid-cols-2">
						{rows.map((inspection) => {
							const row = inspection;
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
											{inspectionHabitatLabel(row)}
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
			</PanelRows>
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
