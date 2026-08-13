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
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ChevronRightIcon, iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	activeDatePresetId,
	type DatePreset,
	DateRangeFilter,
	datePresetRange,
} from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	FilterChip,
	type FilterOption,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	usePersonnelOptions,
} from '../../../components/explorer';
import { WriteOnly } from '../../../components/write-only';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import {
	choiceSetParam,
	dateParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import {
	addDays,
	CONTROL_TYPES,
	controlTypeLabel,
	formatScheduledStart,
	MISSION_STATUS_LABELS,
	type MissionProgressCounts,
	type MissionStatus,
	type MissionView,
	missionDisplayName,
	useAllControlMethodNames,
	useMissionItemCounts,
	useMissionStops,
	useMissions,
} from '../-operations-data';
import { MissionStatusBadge, missionStopFeatures, stopSummary } from '../-operations-display';
import { WorklistMap } from '../-worklist-map';

const MissionIcon = iconRegistry.entities.route.icon;

/** Matches a null `assignedToProfileId`; a planned mission may carry nobody. */
const UNASSIGNED = 'unassigned';

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

// A mission list is a schedule, not a history: it opens on the week just gone
// plus the fortnight ahead, so today's dispatch and what is queued behind it are
// both on screen without touching a filter.
const DEFAULT_DAYS_BACK = 7;
const DEFAULT_DAYS_AHEAD = 14;

function MissionsRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const filterDefaults = useMemo<MissionFilters>(
		() => ({
			from: addDays(today, -DEFAULT_DAYS_BACK),
			to: addDays(today, DEFAULT_DAYS_AHEAD),
			statuses: new Set<MissionStatus>(),
			types: new Set(),
			people: new Set(),
		}),
		[today],
	);
	const { filters, setFilters, reset } = useSearchFilters(filterDefaults, FILTER_CODECS);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);

	const { missions, isLoading } = useMissions(filters.from, filters.to);
	const { options: personnelOptions, nameById } = usePersonnelOptions();
	const methodNameById = useAllControlMethodNames();

	const assigneeOptions = useMemo<readonly FilterOption[]>(
		() => [{ id: UNASSIGNED, label: 'Unassigned' }, ...personnelOptions],
		[personnelOptions],
	);

	const visible = useMemo(
		() => missions.filter((mission) => matchesFilters(mission, filters)),
		[missions, filters],
	);

	const visibleIds = useMemo(() => visible.map((mission) => mission.id), [visible]);
	const { countsById } = useMissionItemCounts(visibleIds);

	// Default to the first row, and self-heal when a filter or delete removes it.
	const effectiveId =
		selectedId !== null && visible.some((mission) => mission.id === selectedId)
			? selectedId
			: (visible[0]?.id ?? null);
	const selected = visible.find((mission) => mission.id === effectiveId) ?? null;

	// Missions carry no geometry of their own — the map draws the union of the
	// selected mission's stops, in dispatch order and as the shapes they were
	// drawn as.
	const { stops } = useMissionStops(effectiveId);
	const features = useMemo(() => missionStopFeatures(stops), [stops]);

	const handleFromChange = useCallback(
		(next: string) => {
			setFilters({
				from: next,
				...(next !== '' && filters.to !== '' && next > filters.to ? { to: next } : {}),
			});
		},
		[setFilters, filters.to],
	);
	const handleToChange = useCallback(
		(next: string) => {
			setFilters({
				to: next,
				...(next !== '' && filters.from !== '' && next < filters.from ? { from: next } : {}),
			});
		},
		[setFilters, filters.from],
	);
	const applyPreset = useCallback(
		(preset: DatePreset) => {
			const range = datePresetRange(preset, today);
			setFilters({ from: range.from, to: range.to });
		},
		[setFilters, today],
	);
	const activePresetId = useMemo(
		() => activeDatePresetId(filters.from, filters.to, today),
		[filters.from, filters.to, today],
	);

	const handleSelect = useCallback((id: string) => {
		setSelectedId(id);
		setSelectedStopId(null);
		setHighlightId(null);
	}, []);

	const hasChips = filters.statuses.size > 0 || filters.types.size > 0 || filters.people.size > 0;

	return (
		<MapSplitPage
			map={
				<WorklistMap
					features={features}
					fitKey={effectiveId ?? undefined}
					highlightId={highlightId}
					noun="mission"
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
							<h1 className="m-0 font-semibold text-foreground text-lg leading-none">Missions</h1>
							<span className="text-muted-foreground text-sm">
								{visible.length === 1 ? '1 mission' : `${visible.length} missions`}
							</span>
						</div>
						<WriteOnly minimum="manager">
							<Button asChild size="sm">
								<Link to="/operations/missions/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									New Mission
								</Link>
							</Button>
						</WriteOnly>
					</div>

					<MissionFilterBar
						activePresetId={activePresetId}
						assigneeOptions={assigneeOptions}
						filters={filters}
						nameById={nameById}
						onApplyPreset={applyPreset}
						onFromChange={handleFromChange}
						onReset={reset}
						onToChange={handleToChange}
						setFilters={setFilters}
						today={today}
					/>
				</div>

				<MissionResults
					countsById={countsById}
					hasFilters={hasChips}
					isLoading={isLoading}
					methodNameById={methodNameById}
					missions={visible}
					nameById={nameById}
					onSelect={handleSelect}
					selectedId={effectiveId}
				/>
			</div>
		</MapSplitPage>
	);
}

/** The date window and the three set filters above the list, with their chips. */
function MissionFilterBar({
	activePresetId,
	assigneeOptions,
	filters,
	nameById,
	onApplyPreset,
	onFromChange,
	onReset,
	onToChange,
	setFilters,
	today,
}: {
	readonly activePresetId: string | null;
	readonly assigneeOptions: readonly FilterOption[];
	readonly filters: MissionFilters;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onApplyPreset: (preset: DatePreset) => void;
	readonly onFromChange: (next: string) => void;
	readonly onReset: () => void;
	readonly onToChange: (next: string) => void;
	readonly setFilters: (next: Partial<MissionFilters>) => void;
	readonly today: string;
}) {
	const hasChips = filters.statuses.size > 0 || filters.types.size > 0 || filters.people.size > 0;

	const without = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
		const next = new Set(set);
		next.delete(value);
		return next;
	};

	return (
		<>
			<DateRangeFilter
				activePresetId={activePresetId}
				from={filters.from}
				onApplyPreset={onApplyPreset}
				onFromChange={onFromChange}
				onToChange={onToChange}
				to={filters.to}
				today={today}
			/>

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

			{hasChips ? (
				<ActiveFilterBar onClearAll={onReset}>
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
							label={id === UNASSIGNED ? 'Unassigned' : (nameById.get(id) ?? 'Unknown profile')}
							onRemove={() => setFilters({ people: without(filters.people, id) })}
						/>
					))}
				</ActiveFilterBar>
			) : null}
		</>
	);
}

/**
 * Status, control type, and assignee are matched here rather than in the query:
 * status derives from three nullable timestamps rather than a column, and
 * "unassigned" matches a null one. An empty set means the filter is off.
 */
function matchesFilters(mission: MissionView, filters: MissionFilters): boolean {
	if (filters.statuses.size > 0 && !filters.statuses.has(mission.status)) {
		return false;
	}
	if (filters.types.size > 0 && !filters.types.has(mission.controlType)) {
		return false;
	}
	if (filters.people.size > 0 && !filters.people.has(mission.assignedToProfileId ?? UNASSIGNED)) {
		return false;
	}
	return true;
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
	readonly missions: readonly MissionView[];
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
										New Mission
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
		<ul className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto p-4">
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
	readonly mission: MissionView;
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
						<MissionStatusBadge status={mission.status} />
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
	readonly mission: MissionView;
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
					<MissionStatusBadge status={mission.status} />
				</div>
			</div>
		</div>
	);
}
