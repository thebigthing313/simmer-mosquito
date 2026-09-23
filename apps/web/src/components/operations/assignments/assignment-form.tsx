import { RequiredMark } from '@simmer-mosquito/ui-web/components/form';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { useRef, useState } from 'react';
import {
	formatListDate,
	formatLocalDate,
	localCalendarDay,
	localTimeAsInstant,
	localTimeOfDay,
	parseLocalDate,
} from '../../../lib/local-date';
import { OptionRow, PickerFallback, PickerFrame } from '../../pickers/entity-picker';
import type { RouteSummary } from '../../route-planning/route-summary';
import { NO_ASSIGNEE } from './assignment-data';
/** The planning fields an assignment carries, shared by create and edit. */
export interface AssignmentDetailValues {
	readonly assignmentName: string;
	readonly assignmentDate: string;
	readonly assignedToProfileId: string;
	/**
	 * The deadline, as the organization-local `YYYY-MM-DD` and `HH:MM` it falls
	 * on, both empty for no deadline. Two halves because `due_at` is a
	 * `timestamptz` and a worklist dated Monday can be due Wednesday. One half
	 * without the other is not a deadline, and {@link toDueAt} stores nothing for
	 * it; {@link withDueTime} fills the date from the assignment date.
	 */
	readonly dueDate: string;
	readonly dueTime: string;
}

export function defaultAssignmentDetails(today: string): AssignmentDetailValues {
	return {
		assignmentName: '',
		assignmentDate: today,
		assignedToProfileId: NO_ASSIGNEE,
		dueDate: '',
		dueTime: '',
	};
}

/**
 * The draft with a due time typed into it. An empty due date is filled from
 * the assignment date at that moment and never again; a later change to
 * `assignmentDate` does not follow it. Clearing the time leaves the date.
 */
export function withDueTime(
	values: AssignmentDetailValues,
	dueTime: string,
): AssignmentDetailValues {
	const dueDate = dueTime !== '' && values.dueDate === '' ? values.assignmentDate : values.dueDate;
	return { ...values, dueDate, dueTime };
}

/** Whether the draft holds one half of a deadline and not the other, which no save takes. */
export function deadlineHalfEntered(values: AssignmentDetailValues): boolean {
	return (values.dueDate === '') !== (values.dueTime === '');
}

/**
 * `dueAt` is an instant, and the form asks for it as the day and the wall time
 * the organization reads it as, so the pair is anchored to the organization's
 * clock. Null for an empty deadline and for a half-entered one alike.
 */
export function toDueAt(values: AssignmentDetailValues, timeZone: string): Date | null {
	const instant = localTimeAsInstant(values.dueDate, values.dueTime, timeZone);
	// A `Date` rather than the ISO string the helper produces: `due_at` is a
	// `timestamptz`, and the collection holds one parsed.
	return instant === null ? null : new Date(instant);
}

/**
 * A stored assignment back into the form's shape, so edit starts where create
 * left off. Both halves of the deadline come off `dueAt` on the organization's
 * clock.
 */
export function toAssignmentDetails(
	row: {
		readonly assignmentName: string | null;
		readonly assignmentDate: string;
		readonly assignedToProfileId: string | null;
		readonly dueAt: Date | null;
	},
	timeZone: string,
): AssignmentDetailValues {
	return {
		assignmentName: row.assignmentName ?? '',
		assignmentDate: row.assignmentDate,
		assignedToProfileId: row.assignedToProfileId ?? NO_ASSIGNEE,
		dueDate: localCalendarDay(row.dueAt, timeZone),
		dueTime: localTimeOfDay(row.dueAt, timeZone),
	};
}

/**
 * Whether two drafts would produce the same record. Compared on the form's own
 * values rather than the stored row, because a deadline round-trips through an
 * instant and can come back milliseconds different. Both halves of the
 * deadline are compared.
 */
export function sameAssignmentDetails(
	first: AssignmentDetailValues,
	second: AssignmentDetailValues,
): boolean {
	return (
		first.assignmentName.trim() === second.assignmentName.trim() &&
		first.assignmentDate === second.assignmentDate &&
		first.assignedToProfileId === second.assignedToProfileId &&
		first.dueDate === second.dueDate &&
		first.dueTime === second.dueTime
	);
}

/**
 * `North loop, Sep 15, 2026`, the name a route copy is given before anyone
 * types one. The date is {@link formatListDate}'s wording over the
 * `YYYY-MM-DD` the form holds, so no zone is asked for. With no date the name
 * is the route alone; the date follows as soon as one is picked, through
 * {@link applyGeneratedName}.
 */
export function routeAssignmentName(routeName: string, assignmentDate: string): string {
	return assignmentDate === '' ? routeName : `${routeName}, ${formatListDate(assignmentDate)}`;
}

/**
 * The draft with a generated name written into it, or left as the person
 * typed it, and the string the form should remember as generated after this.
 * The field is untouched when it is empty or holds exactly what was last
 * generated, and only then does `generated` overwrite it. `generated` is `''`
 * when there is nothing to generate, and the same comparison then clears an
 * unedited field and leaves an edited one alone.
 */
export function applyGeneratedName(
	values: AssignmentDetailValues,
	lastGenerated: string,
	generated: string,
): { readonly values: AssignmentDetailValues; readonly generated: string } {
	const untouched = values.assignmentName === '' || values.assignmentName === lastGenerated;
	if (!untouched) {
		return { values, generated: lastGenerated };
	}
	return { values: { ...values, assignmentName: generated }, generated };
}

export function assignmentNameOrNull(values: AssignmentDetailValues): string | null {
	const trimmed = values.assignmentName.trim();
	return trimmed.length === 0 ? null : trimmed;
}

export function assigneeOrNull(values: AssignmentDetailValues): string | null {
	return values.assignedToProfileId === NO_ASSIGNEE ? null : values.assignedToProfileId;
}

export function AssignmentDetailFields({
	values,
	assigneeOptions,
	disabled = false,
	onChange,
}: {
	readonly values: AssignmentDetailValues;
	readonly assigneeOptions: readonly { readonly label: string; readonly value: string }[];
	readonly disabled?: boolean;
	readonly onChange: (next: AssignmentDetailValues) => void;
}) {
	return (
		<div className="grid gap-4">
			<div className="grid gap-1.5">
				<label className="font-medium text-foreground text-sm" htmlFor="assignment-name">
					Name
				</label>
				<Input
					disabled={disabled}
					id="assignment-name"
					onChange={(event) => onChange({ ...values, assignmentName: event.target.value })}
					placeholder="Optional, defaults to the date and assignee"
					value={values.assignmentName}
				/>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="grid gap-1.5">
					<span className="font-medium text-foreground text-sm">
						Date
						<RequiredMark />
					</span>
					<DatePicker
						ariaLabel="Assignment date"
						className="w-full"
						disabled={disabled}
						onChange={(date) =>
							onChange({
								...values,
								assignmentDate: date === undefined ? '' : formatLocalDate(date),
							})
						}
						placeholder="Select date"
						value={parseLocalDate(values.assignmentDate)}
					/>
				</div>

				<div className="grid gap-1.5">
					<span className="font-medium text-foreground text-sm">Due</span>
					<div className="flex gap-2">
						<DatePicker
							ariaLabel="Due date"
							className="min-w-0 flex-1"
							disabled={disabled}
							onChange={(date) =>
								onChange({ ...values, dueDate: date === undefined ? '' : formatLocalDate(date) })
							}
							placeholder="Select date"
							value={parseLocalDate(values.dueDate)}
						/>
						<Input
							aria-label="Due time"
							className="w-auto"
							disabled={disabled}
							id="assignment-due"
							onChange={(event) => onChange(withDueTime(values, event.target.value))}
							type="time"
							value={values.dueTime}
						/>
					</div>
				</div>
			</div>

			<div className="grid gap-1.5">
				<span className="font-medium text-foreground text-sm">Assigned to</span>
				<Select
					disabled={disabled}
					onValueChange={(next) => onChange({ ...values, assignedToProfileId: next })}
					value={values.assignedToProfileId}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select a profile" />
					</SelectTrigger>
					<SelectContent>
						{assigneeOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

/** The first eight routes whose name holds the search, in name order. */
function routeMatches(
	routes: readonly RouteSummary[],
	normalized: string,
): readonly RouteSummary[] {
	const filtered =
		normalized.length === 0
			? routes
			: routes.filter((route) => route.routeName.toLowerCase().includes(normalized));
	return [...filtered]
		.sort((first, second) => first.routeName.localeCompare(second.routeName))
		.slice(0, 8);
}

/** Route picker for the from-route snapshot, filtering the eagerly synced route catalog in memory. */
export function RoutePicker({
	routes,
	stopCountById,
	value,
	onSelect,
}: {
	readonly routes: readonly RouteSummary[];
	readonly stopCountById: ReadonlyMap<string, number>;
	readonly value: string | null;
	readonly onSelect: (route: RouteSummary | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState(
		() => routes.find((route) => route.id === value)?.routeName ?? '',
	);
	const anchorRef = useRef<HTMLDivElement>(null);

	const normalized = search.trim().toLowerCase();
	const matches = routeMatches(routes, normalized);

	return (
		<PickerFrame
			anchorRef={anchorRef}
			label="Route"
			onClear={() => {
				setSelectedLabel('');
				setSearch('');
				onSelect(null);
			}}
			onOpen={() => setOpen(true)}
			onOpenChange={setOpen}
			onSearchChange={(next) => {
				setSearch(next);
				setOpen(true);
			}}
			open={open}
			placeholder="Search routes"
			search={search}
			selectedLabel={selectedLabel}
			value={value}
		>
			{matches.length === 0 ? (
				<PickerFallback label={routes.length === 0 ? 'No routes yet' : 'No route matches'} />
			) : (
				<div className="grid gap-1">
					{matches.map((route) => (
						<OptionRow
							key={route.id}
							onSelect={() => {
								setSelectedLabel(route.routeName);
								setSearch(route.routeName);
								onSelect(route);
								setOpen(false);
							}}
							primary={route.routeName}
							secondary={stopLabel(stopCountById.get(route.id))}
							selected={route.id === value}
						/>
					))}
				</div>
			)}
		</PickerFrame>
	);
}

function stopLabel(count: number | undefined): string | null {
	if (count === undefined) {
		return null;
	}
	return count === 1 ? '1 stop' : `${count} stops`;
}
