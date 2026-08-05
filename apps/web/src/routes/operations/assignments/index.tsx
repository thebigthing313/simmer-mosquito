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
import {
	dateParam,
	type FilterCodecs,
	idSetParam,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { todayDateValue } from '../../control-operations/-control-display';
import { addDaysToDateString } from '../../larval-surveillance/-overview-data';
import {
	type AssignmentStatus,
	type AssignmentView,
	type ProgressCounts,
	useAssignmentItemCounts,
	useAssignmentStops,
	useAssignments,
} from './-assignment-data';
import { AssignmentStatusBadge, formatAssignmentDate, formatDueAt } from './-assignment-display';
import { AssignmentMap } from './-assignment-map';

const AssignmentIcon = iconRegistry.entities.vehicle.icon;

/** Matches a null `assignedToProfileId`; planning drafts may carry nobody. */
const UNASSIGNED = 'unassigned';

const STATUS_OPTIONS: readonly FilterOption[] = [
	{ id: 'notStarted', label: 'Not started' },
	{ id: 'inProgress', label: 'In progress' },
	{ id: 'completed', label: 'Completed' },
	{ id: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Readonly<Record<AssignmentStatus, string>> = {
	notStarted: 'Not started',
	inProgress: 'In progress',
	completed: 'Completed',
	cancelled: 'Cancelled',
};

interface AssignmentFilters {
	readonly from: string;
	readonly to: string;
	readonly people: ReadonlySet<string>;
	readonly statuses: ReadonlySet<string>;
}

const FILTER_CODECS: FilterCodecs<AssignmentFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	statuses: idSetParam,
};

export const Route = createFileRoute('/operations/assignments/')({
	component: AssignmentsIndexRoute,
	validateSearch: searchValidator(FILTER_CODECS),
});

// An assignment list is a schedule, not a history: it opens on the week just gone
// plus the fortnight ahead, so today's work and what is queued behind it are both
// on screen without touching a filter.
const DEFAULT_DAYS_BACK = 7;
const DEFAULT_DAYS_AHEAD = 14;

function AssignmentsIndexRoute() {
	const today = useMemo(() => todayDateValue(), []);
	const filterDefaults = useMemo<AssignmentFilters>(
		() => ({
			from: addDaysToDateString(today, -DEFAULT_DAYS_BACK),
			to: addDaysToDateString(today, DEFAULT_DAYS_AHEAD),
			people: new Set(),
			statuses: new Set(),
		}),
		[today],
	);
	const { filters, setFilters, reset } = useSearchFilters(filterDefaults, FILTER_CODECS);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);

	const { assignments, isLoading } = useAssignments(filters.from, filters.to);
	const { options: personnelOptions, nameById } = usePersonnelOptions();

	const assigneeOptions = useMemo<readonly FilterOption[]>(
		() => [{ id: UNASSIGNED, label: 'Unassigned' }, ...personnelOptions],
		[personnelOptions],
	);

	// Assignee and status are filtered here rather than in the query: status is
	// derived from three nullable timestamps, and "unassigned" matches a null column.
	const visible = useMemo(
		() =>
			assignments.filter((assignment) => {
				if (filters.statuses.size > 0 && !filters.statuses.has(assignment.status)) {
					return false;
				}
				if (filters.people.size > 0) {
					const key = assignment.assignedToProfileId ?? UNASSIGNED;
					if (!filters.people.has(key)) {
						return false;
					}
				}
				return true;
			}),
		[assignments, filters.statuses, filters.people],
	);

	const visibleIds = useMemo(() => visible.map((assignment) => assignment.id), [visible]);
	const { countsById } = useAssignmentItemCounts(visibleIds);

	// Default to the first row, and self-heal when a filter or delete removes it.
	const effectiveId =
		selectedId !== null && visible.some((assignment) => assignment.id === selectedId)
			? selectedId
			: (visible[0]?.id ?? null);
	const selected = visible.find((assignment) => assignment.id === effectiveId) ?? null;
	const { features, counts, stops } = useAssignmentStops(effectiveId);

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

	const hasFilters = filters.people.size > 0 || filters.statuses.size > 0;

	return (
		<MapSplitPage
			map={
				<AssignmentMap
					features={features}
					fitKey={effectiveId ?? undefined}
					highlightId={highlightId}
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
				</AssignmentMap>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-baseline gap-2">
							<h1 className="font-semibold text-foreground text-lg leading-none">Assignments</h1>
							<span className="text-muted-foreground text-sm">
								{visible.length === 1 ? '1 assignment' : `${visible.length} assignments`}
							</span>
						</div>
						<WriteOnly minimum="manager">
							<Button asChild size="sm">
								<Link to="/operations/assignments/create">
									<PlusIcon aria-hidden="true" />
									New Assignment
								</Link>
							</Button>
						</WriteOnly>
					</div>

					<DateRangeFilter
						activePresetId={activePresetId}
						from={filters.from}
						onApplyPreset={applyPreset}
						onFromChange={handleFromChange}
						onToChange={handleToChange}
						to={filters.to}
						today={today}
					/>

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
							onChange={(next) => setFilters({ statuses: next })}
							options={STATUS_OPTIONS}
							selected={filters.statuses}
						/>
					</div>

					{hasFilters ? (
						<ActiveFilterBar onClearAll={reset}>
							{[...filters.people].map((id) => (
								<FilterChip
									key={id}
									label={id === UNASSIGNED ? 'Unassigned' : (nameById.get(id) ?? 'Unknown profile')}
									onRemove={() => {
										const next = new Set(filters.people);
										next.delete(id);
										setFilters({ people: next });
									}}
								/>
							))}
							{[...filters.statuses].map((status) => (
								<FilterChip
									key={status}
									label={STATUS_LABELS[status as AssignmentStatus] ?? status}
									onRemove={() => {
										const next = new Set(filters.statuses);
										next.delete(status);
										setFilters({ statuses: next });
									}}
								/>
							))}
						</ActiveFilterBar>
					) : null}
				</div>

				<AssignmentResults
					assignments={visible}
					countsById={countsById}
					hasFilters={hasFilters}
					isLoading={isLoading}
					nameById={nameById}
					onSelect={handleSelect}
					selectedId={effectiveId}
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
	readonly assignments: readonly AssignmentView[];
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
										New Assignment
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
	);
}

function AssignmentRow({
	assignment,
	assigneeName,
	counts,
	isSelected,
	onSelect,
}: {
	readonly assignment: AssignmentView;
	readonly assigneeName: string | null;
	readonly counts: ProgressCounts | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const due = formatDueAt(assignment.dueAt);

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
						<AssignmentStatusBadge status={assignment.status} />
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
	readonly assignment: AssignmentView;
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
					<AssignmentStatusBadge status={assignment.status} />
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
