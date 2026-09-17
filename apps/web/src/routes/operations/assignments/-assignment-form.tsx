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
import { OptionRow, PickerFallback, PickerFrame } from '../../../components/pickers/entity-picker';
import type { RouteSummary } from '../../../components/route-planning/route-summary';
import {
	formatListDate,
	formatLocalDate,
	localCalendarDay,
	localTimeAsInstant,
	localTimeOfDay,
	parseLocalDate,
} from '../../../lib/local-date';
import { NO_ASSIGNEE } from './-assignment-data';

/** The planning fields an assignment carries, shared by create and edit. */
export interface AssignmentDetailValues {
	readonly assignmentName: string;
	readonly assignmentDate: string;
	readonly assignedToProfileId: string;
	/**
	 * The deadline, as the organization-local `YYYY-MM-DD` and `HH:MM` it falls
	 * on, both empty for no deadline.
	 *
	 * Two halves rather than a time anchored to `assignmentDate`, because
	 * `due_at` is a `timestamptz` and names any instant: a worklist dated Monday
	 * can be due Wednesday. One half without the other is not a deadline, and
	 * {@link toDueAt} stores nothing for it; {@link withDueTime} fills the date
	 * from the assignment date so the common case, typing a time, never leaves
	 * the shape half entered.
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
 * The draft with a due time typed into it.
 *
 * A time is the half an operator reaches for first, and a time on no day is
 * not a deadline, so an empty due date is filled from the assignment date at
 * that moment and never again: a date the operator has entered stays, and a
 * later change to `assignmentDate` does not follow it (#1005). Clearing the
 * time leaves the date where it is, so retyping a time does not also mean
 * repicking the day.
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
 * the organization reads it as. Which instant that pair names is the
 * organization's to say. Anchored to the *browser's* clock this read back
 * through `formatDueAt`, which has always shown the organization's, as a time
 * nobody set, and the further the dispatcher is from the yard the further off
 * it is.
 *
 * Null for an empty deadline and for a half-entered one alike: a time on no
 * day is a deadline on an unstated day, and the form refuses to save that
 * shape rather than guessing which day was meant.
 */
export function toDueAt(values: AssignmentDetailValues, timeZone: string): Date | null {
	const instant = localTimeAsInstant(values.dueDate, values.dueTime, timeZone);
	// A `Date` rather than the ISO string the helper produces: `due_at` is a
	// `timestamptz`, and the collection holds one parsed. Handing a string to the
	// row would type-check nowhere useful and sort against the parsed ones wrongly.
	return instant === null ? null : new Date(instant);
}

/**
 * A stored assignment back into the form's shape, so edit starts where create
 * left off.
 *
 * Both halves of the deadline come off `dueAt` on the organization's clock.
 * Reading the time alone was the bug: a deadline on another day hydrated as
 * that time on the assignment date, and the next detail save wrote it there.
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
 * Whether two drafts would produce the same record.
 *
 * Compared on the form's own values rather than on the stored row: a deadline
 * round-trips through an instant, so an unedited `dueAt` can come back a few
 * milliseconds different and read as a change nobody made. Both halves are
 * compared, because comparing the time alone let a deadline on another day
 * read as unchanged while a save would have moved it.
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
 * types one (#1007).
 *
 * The date is {@link formatListDate}'s wording, the same the explorer lists
 * draw, and it takes the assignment date as the `YYYY-MM-DD` the form holds:
 * which day that is was the organization's to say when the date was picked,
 * so no zone is asked for here. A comma and not a dash, because
 * `check:copy-dashes` reads what a form writes into a field the same as any
 * other copy. The weekday stays off since the list draws it beside the name
 * already.
 *
 * With no date there is no date to write, so the name is the route alone
 * rather than a route with a comma hanging off it; the date follows as soon
 * as one is picked, through {@link applyGeneratedName}.
 */
export function routeAssignmentName(routeName: string, assignmentDate: string): string {
	return assignmentDate === '' ? routeName : `${routeName}, ${formatListDate(assignmentDate)}`;
}

/**
 * The draft with a generated name written into it, or left as the person
 * typed it, and the string the form should remember as generated after this.
 *
 * "Untouched" is the rule, and it is read off the field rather than off a
 * flag: the field is untouched when it is empty or holds exactly what was
 * last generated, and only then does `generated` overwrite it. Comparing
 * against the remembered string is what lets the date change after the route
 * was picked without clobbering a typed name, and what lets a person who typed
 * and deleted back to empty get the default at the next change. A flag set on
 * every keystroke would answer "edited" to both.
 *
 * `generated` is `''` when there is nothing to generate, the route cleared or
 * the mode back to Blank, and the same comparison then clears an unedited
 * field and leaves an edited one alone. The remembered string moves only when
 * the field does, so an edited field is still compared against the value it
 * was edited away from.
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

/**
 * Route picker for the from-route snapshot. Filters the eagerly synced route
 * catalog in memory — the same approach as the trap picker, and the catalog runs
 * to a few hundred rows at most.
 */
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
