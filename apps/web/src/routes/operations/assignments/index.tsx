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
	DateRangeChip,
	FilterChip,
	type FilterOption,
	MultiSelectFilter,
	RESULT_SKELETON_KEYS,
	without,
} from '../../../components/explorer';
import { AssignmentStatusBadge } from '../../../components/operations/assignments/assignment-display';
import { WorklistMap } from '../../../components/operations/worklist-map';
import { WriteOnly } from '../../../components/write-only';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useAssignmentStops } from '../../../hooks/operations/use-assignment-stops';
import { useWorklistIndex } from '../../../hooks/operations/use-worklist-index';
import {
	ASSIGNMENT_STATUS_LABELS,
	ASSIGNMENT_STATUSES,
	type AssignmentListing,
	type AssignmentStatus,
	assignmentStatus,
	formatAssignmentDate,
	formatDueAt,
	type ProgressCounts,
} from '../../../hooks/queries/assignment-view';
import { useAssignmentItemCounts } from '../../../hooks/queries/use-assignment-item-counts';
import { useAssignments } from '../../../hooks/queries/use-assignments';
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

const AssignmentIcon = iconRegistry.entities.vehicle.icon;

const STATUS_OPTIONS: readonly FilterOption[] = ASSIGNMENT_STATUSES.map((status) => ({
	id: status,
	label: ASSIGNMENT_STATUS_LABELS[status],
}));

interface AssignmentFilters {
	readonly from: string;
	readonly to: string;
	readonly people: ReadonlySet<string>;
	readonly statuses: ReadonlySet<AssignmentStatus>;
}

const FILTER_CODECS: FilterCodecs<AssignmentFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	statuses: choiceSetParam(ASSIGNMENT_STATUSES),
};

export const Route = createFileRoute('/operations/assignments/')({
	component: AssignmentsIndexRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

function AssignmentsIndexRoute() {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	// An assignment list is a schedule, not a history, so it opens on the schedule window.
	const scheduleRange = datePresetRange(SCHEDULE_WINDOW, today);
	const filterDefaults: AssignmentFilters = {
		from: scheduleRange.from,
		to: scheduleRange.to,
		people: new Set(),
		statuses: new Set<AssignmentStatus>(),
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

	const { assignments, isLoading } = useAssignments(filters.from, filters.to);
	const personnel = usePersonnelOptions();
	const { nameById } = personnel;

	// Status derives from three nullable timestamps, so it is matched over the loaded rows.
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
		rows: assignments,
		statusOf: assignmentStatus,
		assigneeOf: (assignment) => assignment.assignedToProfileId,
		filters,
		personnel,
	});

	const visibleIds = visible.map((assignment) => assignment.id);
	const { countsById } = useAssignmentItemCounts(visibleIds);
	const { features, counts, stops } = useAssignmentStops(selectedId);

	// The empty state reads the set filters alone and not the window, because
	// its copy already names the date range; the chip bar counts both.
	const hasSetFilter = filters.people.size > 0 || filters.statuses.size > 0;

	return (
		<MapSplitPage
			map={
				<WorklistMap
					features={features}
					fitKey={selectedId ?? undefined}
					highlightId={highlightId}
					recordType="assignment"
					onHoverStop={setHighlightId}
					onSelectStop={setSelectedStopId}
					selectedId={selectedStopId}
					stopCount={stops.length}
				>
					{selected === null ? null : (
						<SelectedAssignmentCard
							assignment={selected}
							assigneeName={
								selected.assignedToProfileId === null
									? null
									: (nameById.get(selected.assignedToProfileId) ?? null)
							}
							counts={counts}
						/>
					)}
				</WorklistMap>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-baseline gap-2">
							<h1 className="font-semibold text-foreground text-lg leading-none">
								{recordNoun('assignment').titleMany}
							</h1>
							<span className="text-muted-foreground text-sm">
								{visible.length === 1 ? '1 assignment' : `${visible.length} assignments`}
							</span>
						</div>
						<WriteOnly minimum="manager">
							<Button asChild size="sm">
								<Link to="/operations/assignments/create">
									<PlusIcon aria-hidden="true" />
									{createLabel('assignment')}
								</Link>
							</Button>
						</WriteOnly>
					</div>

					<DateRangeFilter {...dateRange} />

					<div className="flex flex-wrap gap-2">
						<MultiSelectFilter
							empty="No profiles"
							label="Assigned to"
							onChange={(next) => setFilters({ people: next })}
							options={assigneeOptions}
							selected={filters.people}
						/>
						<MultiSelectFilter
							empty="No statuses"
							label="Status"
							onChange={(next) =>
								setFilters({
									statuses: new Set(ASSIGNMENT_STATUSES.filter((status) => next.has(status))),
								})
							}
							options={STATUS_OPTIONS}
							selected={filters.statuses}
						/>
					</div>

					{activeCount > 0 ? (
						<ActiveFilterBar onClearAll={reset}>
							<DateRangeChip defaults={scheduleRange} range={filters} setRange={setFilters} />
							{[...filters.people].map((id) => (
								<FilterChip
									key={id}
									label={assigneeLabel(id)}
									onRemove={() => setFilters({ people: without(filters.people, id) })}
								/>
							))}
							{[...filters.statuses].map((status) => (
								<FilterChip
									key={status}
									label={ASSIGNMENT_STATUS_LABELS[status]}
									onRemove={() => setFilters({ statuses: without(filters.statuses, status) })}
								/>
							))}
						</ActiveFilterBar>
					) : null}
				</div>

				<AssignmentResults
					assignments={visible}
					countsById={countsById}
					hasFilters={hasSetFilter}
					isLoading={isLoading}
					nameById={nameById}
					onSelect={handleSelect}
					selectedId={selectedId}
				/>
			</div>
		</MapSplitPage>
	);
}

function AssignmentResults({
	assignments,
	countsById,
	hasFilters,
	isLoading,
	nameById,
	onSelect,
	selectedId,
}: {
	readonly assignments: readonly AssignmentListing[];
	readonly countsById: ReadonlyMap<string, ProgressCounts>;
	readonly hasFilters: boolean;
	readonly isLoading: boolean;
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

	if (assignments.length === 0) {
		return (
			<div className="p-4">
				<Empty className="min-h-[240px] border border-border/40 bg-muted/30">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<AssignmentIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{hasFilters ? 'No Matching Assignments' : 'No Assignments Yet'}</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? 'No assignment in this date range matches the current filters.'
								: 'Assignments dated in this range will appear here.'}
						</EmptyDescription>
					</EmptyHeader>
					{hasFilters ? null : (
						<EmptyContent>
							<WriteOnly minimum="manager">
								<Button asChild size="sm">
									<Link to="/operations/assignments/create">
										<PlusIcon aria-hidden="true" />
										{createLabel('assignment')}
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
				{assignments.map((assignment) => (
					<AssignmentRow
						assignment={assignment}
						assigneeName={
							assignment.assignedToProfileId === null
								? null
								: (nameById.get(assignment.assignedToProfileId) ?? null)
						}
						counts={countsById.get(assignment.id) ?? null}
						isSelected={assignment.id === selectedId}
						key={assignment.id}
						onSelect={onSelect}
					/>
				))}
			</ul>
		</ScrollArea>
	);
}

function AssignmentRow({
	assignment,
	assigneeName,
	counts,
	isSelected,
	onSelect,
}: {
	readonly assignment: AssignmentListing;
	readonly assigneeName: string | null;
	readonly counts: ProgressCounts | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const timeZone = useOrganizationTimeZone();
	const due = formatDueAt(assignment.dueAt, timeZone);

	return (
		<li
			className={cn(
				'relative rounded-lg border bg-card transition-colors',
				isSelected ? 'border-primary/60 bg-primary/5' : 'border-border/60 hover:border-border',
			)}
		>
			{/* Full-card target selects on the map; the chevron opens the record. */}
			<button
				aria-label={`Show ${assignment.assignmentName ?? assignment.assignmentDate} on the map`}
				className="absolute inset-0 z-0 cursor-pointer rounded-lg"
				onClick={() => onSelect(assignment.id)}
				type="button"
			/>
			<div className="pointer-events-none relative z-10 flex items-start gap-3 p-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-foreground text-sm">
							{assignment.assignmentName?.trim() || formatAssignmentDate(assignment.assignmentDate)}
						</span>
						<AssignmentStatusBadge status={assignmentStatus(assignment)} />
					</div>
					<p className="m-0 mt-1 text-muted-foreground text-xs">
						{assignment.assignmentName?.trim()
							? `${formatAssignmentDate(assignment.assignmentDate)} · `
							: ''}
						{assigneeName ?? 'Unassigned'}
						{due === null ? '' : ` · due ${due}`}
					</p>
					<p className="m-0 mt-1 text-muted-foreground text-xs">{stopSummary(counts)}</p>
				</div>
				<Link
					aria-label="Open assignment"
					className="pointer-events-auto z-20 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					params={{ id: assignment.id }}
					to="/operations/assignments/$id"
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

function SelectedAssignmentCard({
	assignment,
	assigneeName,
	counts,
}: {
	readonly assignment: AssignmentListing;
	readonly assigneeName: string | null;
	readonly counts: ProgressCounts;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center sm:justify-start">
			<div className="pointer-events-auto w-full max-w-sm rounded-lg border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 className="truncate font-semibold text-foreground text-sm leading-tight">
							{assignment.assignmentName?.trim() || formatAssignmentDate(assignment.assignmentDate)}
						</h2>
						<p className="m-0 text-muted-foreground text-xs">
							{assigneeName ?? 'Unassigned'} · {stopSummary(counts)}
						</p>
					</div>
					<AssignmentStatusBadge status={assignmentStatus(assignment)} />
				</div>
				<div className="mt-3 flex gap-2">
					<Button asChild className="flex-1" size="sm">
						<Link params={{ id: assignment.id }} to="/operations/assignments/$id">
							Open
						</Link>
					</Button>
					<WriteOnly minimum="manager">
						<Button asChild className="flex-1" size="sm" variant="outline">
							<Link params={{ id: assignment.id }} to="/operations/assignments/$id/edit">
								Edit
							</Link>
						</Button>
					</WriteOnly>
				</div>
			</div>
		</div>
	);
}

function stopSummary(counts: ProgressCounts | null): string {
	if (counts === null || counts.total === 0) {
		return 'No stops';
	}
	const stops = counts.total === 1 ? '1 stop' : `${counts.total} stops`;
	return counts.handled === 0 ? stops : `${stops} · ${counts.handled} of ${counts.total} done`;
}
