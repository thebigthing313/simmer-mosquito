import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ChevronRightIcon, iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	type DateRange,
	DateRangeChip,
	FilterChip,
	type FilterOption,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	without,
} from '../../../components/explorer';
import {
	MissionStatusBadge,
	missionStopFeatures,
	stopSummary,
} from '../../../components/operations/operations-display';
import { WorklistMap } from '../../../components/operations/worklist-map';
import { WriteOnly } from '../../../components/write-only';
import { useControlMethodNames } from '../../../hooks/explorer/use-control-method-names';
import {
	type DateRangeBinding,
	useDateRangeFilters,
} from '../../../hooks/explorer/use-date-range-filters';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useMissionStopViews } from '../../../hooks/operations/use-mission-stop-views';
import { useWorklistIndex } from '../../../hooks/operations/use-worklist-index';
import {
	CONTROL_TYPES,
	controlTypeLabel,
	formatScheduledStart,
	MISSION_STATUS_LABELS,
	type MissionListing,
	type MissionProgressCounts,
	type MissionStatus,
	missionDisplayName,
	missionStatus,
} from '../../../hooks/queries/operations-view';
import { useMissionItemCounts } from '../../../hooks/queries/use-mission-item-counts';
import { useMissions } from '../../../hooks/queries/use-missions';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { datePresetRange, SCHEDULE_WINDOW } from '../../../lib/date-presets';
import { todayInTimeZone } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import {
	choiceSetParam,
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
} from '../../../lib/search-filters';

const MissionIcon = iconRegistry.entities.route.icon;

const MISSION_STATUSES: readonly MissionStatus[] = [
	'scheduled',
	'inProgress',
	'completed',
	'cancelled',
];

const STATUS_OPTIONS: readonly FilterOption[] = MISSION_STATUSES.map((status) => ({
	id: status,
	label: MISSION_STATUS_LABELS[status],
}));

const CONTROL_TYPE_OPTIONS: readonly FilterOption[] = CONTROL_TYPES.map((controlType) => ({
	id: controlType,
	label: controlTypeLabel(controlType),
}));

interface MissionFilters {
	readonly from: string;
	readonly to: string;
	readonly statuses: ReadonlySet<MissionStatus>;
	readonly types: ReadonlySet<string>;
	readonly people: ReadonlySet<string>;
}

const FILTER_CODECS: FilterCodecs<MissionFilters> = {
	from: dateParam,
	to: dateParam,
	statuses: choiceSetParam(MISSION_STATUSES),
	types: idSetParam,
	people: idSetParam,
};

export const Route = createFileRoute('/operations/missions/')({
	component: MissionsRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

function MissionsRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	// A mission list is a schedule, not a history, so it opens on the schedule window.
	const scheduleRange = datePresetRange(SCHEDULE_WINDOW, today);
	const filterDefaults: MissionFilters = {
		from: scheduleRange.from,
		to: scheduleRange.to,
		statuses: new Set<MissionStatus>(),
		types: new Set(),
		people: new Set(),
	};
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		filterDefaults,
		FILTER_CODECS,
		DATE_RANGE_COUNTING,
	);
	const dateRange = useDateRangeFilters({
		from: filters.from,
		to: filters.to,
		today,
		setFilters,
		direction: 'schedule',
	});

	const { missions, isLoading } = useMissions(filters.from, filters.to);
	const personnel = usePersonnelOptions();
	const { nameById } = personnel;
	const methodNameById = useControlMethodNames();

	// Status derives from three nullable timestamps and control type is the
	// page's own filter, so both are matched over the loaded rows.
	const {
		visible,
		selectedId,
		selected,
		selectedStopId,
		setSelectedStopId,
		highlightId,
		setHighlightId,
		handleSelect,
		assigneeOptions,
		assigneeLabel,
	} = useWorklistIndex({
		rows: missions,
		statusOf: missionStatus,
		assigneeOf: (mission) => mission.assignedToProfileId,
		filters,
		matches: (mission) => filters.types.size === 0 || filters.types.has(mission.controlType),
		personnel,
	});

	const visibleIds = visible.map((mission) => mission.id);
	const { countsById } = useMissionItemCounts(visibleIds);

	// Missions carry no geometry of their own. The map draws the union of the
	// selected mission's stops, in dispatch order and as the shapes they were
	// drawn as.
	const { stops } = useMissionStopViews(selectedId);
	const features = missionStopFeatures(stops);

	const hasSetFilter =
		filters.statuses.size > 0 || filters.types.size > 0 || filters.people.size > 0;

	return (
		<MapSplitPage
			map={
				<WorklistMap
					features={features}
					fitKey={selectedId ?? undefined}
					highlightId={highlightId}
					recordType="mission"
					onHoverStop={setHighlightId}
					onSelectStop={setSelectedStopId}
					selectedId={selectedStopId}
					stopCount={stops.length}
				>
					{selected === null ? null : (
						<SelectedMissionCard
							assigneeName={
								selected.assignedToProfileId === null
									? null
									: (nameById.get(selected.assignedToProfileId) ?? null)
							}
							counts={countsById.get(selected.id) ?? null}
							mission={selected}
						/>
					)}
				</WorklistMap>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-baseline gap-2">
							<h1 className="m-0 font-semibold text-foreground text-lg leading-none">
								{recordNoun('mission').titleMany}
							</h1>
							<span className="text-muted-foreground text-sm">
								{visible.length === 1 ? '1 mission' : `${visible.length} missions`}
							</span>
						</div>
						<WriteOnly minimum="manager">
							<Button asChild size="sm">
								<Link to="/operations/missions/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									{createLabel('mission')}
								</Link>
							</Button>
						</WriteOnly>
					</div>

					<MissionFilterBar
						activeCount={activeCount}
						assigneeLabel={assigneeLabel}
						assigneeOptions={assigneeOptions}
						dateRange={dateRange}
						defaultRange={scheduleRange}
						filters={filters}
						onReset={reset}
						setFilters={setFilters}
					/>
				</div>

				<MissionResults
					countsById={countsById}
					hasFilters={hasSetFilter}
					isLoading={isLoading}
					methodNameById={methodNameById}
					missions={visible}
					nameById={nameById}
					onSelect={handleSelect}
					selectedId={selectedId}
				/>
			</div>
		</MapSplitPage>
	);
}

/**
 * The date window and the three set filters above the list, with their chips.
 * The chip bar draws while `activeCount` is above zero, which counts a window
 * moved off `defaultRange` as one filter.
 */
function MissionFilterBar({
	activeCount,
	assigneeLabel,
	assigneeOptions,
	dateRange,
	defaultRange,
	filters,
	onReset,
	setFilters,
}: {
	readonly activeCount: number;
	readonly assigneeLabel: (id: string) => string;
	readonly assigneeOptions: readonly FilterOption[];
	readonly dateRange: DateRangeBinding;
	readonly defaultRange: DateRange;
	readonly filters: MissionFilters;
	readonly onReset: () => void;
	readonly setFilters: (next: Partial<MissionFilters>) => void;
}) {
	return (
		<>
			<DateRangeFilter {...dateRange} />

			<div className="flex flex-wrap gap-2">
				<MultiSelectFilter
					empty="No statuses"
					label="Status"
					onChange={(next) => setFilters({ statuses: next as ReadonlySet<MissionStatus> })}
					options={STATUS_OPTIONS}
					selected={filters.statuses}
				/>
				<MultiSelectFilter
					empty="No control types"
					label="Control type"
					onChange={(next) => setFilters({ types: next })}
					options={CONTROL_TYPE_OPTIONS}
					selected={filters.types}
				/>
				<MultiSelectFilter
					empty="No profiles"
					label="Assigned to"
					onChange={(next) => setFilters({ people: next })}
					options={assigneeOptions}
					selected={filters.people}
				/>
			</div>

			{activeCount > 0 ? (
				<ActiveFilterBar onClearAll={onReset}>
					<DateRangeChip defaults={defaultRange} range={filters} setRange={setFilters} />
					{[...filters.statuses].map((status) => (
						<FilterChip
							key={`status-${status}`}
							label={MISSION_STATUS_LABELS[status]}
							onRemove={() => setFilters({ statuses: without(filters.statuses, status) })}
						/>
					))}
					{[...filters.types].map((id) => (
						<FilterChip
							key={`type-${id}`}
							label={controlTypeLabel(id)}
							onRemove={() => setFilters({ types: without(filters.types, id) })}
						/>
					))}
					{[...filters.people].map((id) => (
						<FilterChip
							key={`person-${id}`}
							label={assigneeLabel(id)}
							onRemove={() => setFilters({ people: without(filters.people, id) })}
						/>
					))}
				</ActiveFilterBar>
			) : null}
		</>
	);
}

function MissionResults({
	missions,
	countsById,
	hasFilters,
	isLoading,
	methodNameById,
	nameById,
	onSelect,
	selectedId,
}: {
	readonly missions: readonly MissionListing[];
	readonly countsById: ReadonlyMap<string, MissionProgressCounts>;
	readonly hasFilters: boolean;
	readonly isLoading: boolean;
	readonly methodNameById: ReadonlyMap<string, string>;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
	readonly selectedId: string | null;
}) {
	if (isLoading) {
		return (
			<div className="grid gap-2 p-4">
				{RESULT_SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[72px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (missions.length === 0) {
		return (
			<div className="p-4">
				<Empty className="min-h-[240px] border border-border/40 bg-muted/30">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MissionIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{hasFilters ? 'No Matching Missions' : 'No Missions Scheduled'}</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? 'No mission in this date range matches the current filters.'
								: 'Missions scheduled to start in this range will appear here.'}
						</EmptyDescription>
					</EmptyHeader>
					{hasFilters ? null : (
						<EmptyContent>
							<WriteOnly minimum="manager">
								<Button asChild size="sm">
									<Link to="/operations/missions/create">
										<PlusIcon aria-hidden="true" data-icon="inline-start" />
										{createLabel('mission')}
									</Link>
								</Button>
							</WriteOnly>
						</EmptyContent>
					)}
				</Empty>
			</div>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1" type="auto">
			<ul className="m-0 list-none space-y-2 p-4">
				{missions.map((mission) => (
					<MissionRow
						assigneeName={
							mission.assignedToProfileId === null
								? null
								: (nameById.get(mission.assignedToProfileId) ?? null)
						}
						counts={countsById.get(mission.id) ?? null}
						isSelected={mission.id === selectedId}
						key={mission.id}
						methodName={
							mission.plannedMethodId === null
								? null
								: (methodNameById.get(mission.plannedMethodId) ?? null)
						}
						mission={mission}
						onSelect={onSelect}
					/>
				))}
			</ul>
		</ScrollArea>
	);
}

function MissionRow({
	mission,
	assigneeName,
	counts,
	methodName,
	isSelected,
	onSelect,
}: {
	readonly mission: MissionListing;
	readonly assigneeName: string | null;
	readonly counts: MissionProgressCounts | null;
	readonly methodName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const timeZone = useOrganizationTimeZone();
	const name = missionDisplayName(mission, timeZone);

	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected ? 'border-primary/60 bg-primary/5' : 'border-border/60 hover:border-border',
			)}
		>
			{/* Full-card target selects on the map; the chevron opens the record. */}
			<button
				aria-label={`Show ${name} on the map`}
				className="absolute inset-0 z-0 cursor-pointer rounded-lg"
				onClick={() => onSelect(mission.id)}
				type="button"
			/>
			<div className="pointer-events-none relative z-10 flex items-start gap-3 p-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-foreground text-sm">{name}</span>
						<MissionStatusBadge status={missionStatus(mission)} />
					</div>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{controlTypeLabel(mission.controlType)}
						{methodName === null ? '' : ` · ${methodName}`}
						{` · ${formatScheduledStart(mission.scheduledStartAt, timeZone)}`}
					</p>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{assigneeName ?? 'Unassigned'} · {stopSummary(counts)}
					</p>
				</div>
				<Link
					aria-label="Open mission"
					className="pointer-events-auto z-20 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					params={{ id: mission.id }}
					to="/operations/missions/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

function SelectedMissionCard({
	mission,
	assigneeName,
	counts,
}: {
	readonly mission: MissionListing;
	readonly assigneeName: string | null;
	readonly counts: MissionProgressCounts | null;
}) {
	const timeZone = useOrganizationTimeZone();
	return (
		<div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center sm:justify-start">
			<div className="pointer-events-auto w-full max-w-sm rounded-lg border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 className="m-0 truncate font-semibold text-foreground text-sm leading-tight">
							{missionDisplayName(mission, timeZone)}
						</h2>
						<p className="m-0 text-muted-foreground text-xs">
							{assigneeName ?? 'Unassigned'} · {stopSummary(counts)}
						</p>
					</div>
					<MissionStatusBadge status={missionStatus(mission)} />
				</div>
			</div>
		</div>
	);
}
