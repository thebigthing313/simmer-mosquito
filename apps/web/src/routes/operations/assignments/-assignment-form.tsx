import type { RouteRow } from '@simmer-mosquito/sync';
import { DatePicker } from '@simmer-mosquito/ui-web/components/ui/date-picker';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { useMemo, useRef, useState } from 'react';
import { OptionRow, PickerFallback, PickerFrame } from '../../../components/pickers/entity-picker';
import { RequiredMark } from '../../../components/required-mark';
import { NO_ASSIGNEE } from './-assignment-data';

/** The planning fields an assignment carries, shared by create and edit. */
export interface AssignmentDetailValues {
	readonly assignmentName: string;
	readonly assignmentDate: string;
	readonly assignedToProfileId: string;
	/** `HH:MM` on the assignment date, or empty for no due time. */
	readonly dueTime: string;
}

export function defaultAssignmentDetails(today: string): AssignmentDetailValues {
	return {
		assignmentName: '',
		assignmentDate: today,
		assignedToProfileId: NO_ASSIGNEE,
		dueTime: '',
	};
}

/**
 * `dueAt` is an instant, but an assignment covers one agency-local day, so the
 * form asks for a time and anchors it to that day rather than making the operator
 * key a second date that would have to match the first.
 */
export function toDueAt(values: AssignmentDetailValues): string | null {
	if (values.dueTime === '' || values.assignmentDate === '') {
		return null;
	}
	const [hour, minute] = values.dueTime.split(':').map(Number);
	const parsed = parseLocalDate(values.assignmentDate);
	if (parsed === undefined || hour === undefined || minute === undefined) {
		return null;
	}
	parsed.setHours(hour, minute, 0, 0);
	return parsed.toISOString();
}

/** The stored instant back into an `HH:MM` field value. */
export function toDueTime(dueAt: string | null): string {
	if (dueAt === null) {
		return '';
	}
	const parsed = new Date(dueAt);
	if (Number.isNaN(parsed.getTime())) {
		return '';
	}
	return `${`${parsed.getHours()}`.padStart(2, '0')}:${`${parsed.getMinutes()}`.padStart(2, '0')}`;
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
					placeholder="Optional — defaults to the date and assignee"
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
					<label className="font-medium text-foreground text-sm" htmlFor="assignment-due">
						Due time
					</label>
					<Input
						disabled={disabled}
						id="assignment-due"
						onChange={(event) => onChange({ ...values, dueTime: event.target.value })}
						type="time"
						value={values.dueTime}
					/>
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
	readonly routes: readonly RouteRow[];
	readonly stopCountById: ReadonlyMap<string, number>;
	readonly value: string | null;
	readonly onSelect: (route: RouteRow | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [selectedLabel, setSelectedLabel] = useState(
		() => routes.find((route) => route.id === value)?.routeName ?? '',
	);
	const anchorRef = useRef<HTMLDivElement>(null);

	const normalized = search.trim().toLowerCase();
	const matches = useMemo(() => {
		const filtered =
			normalized.length === 0
				? routes
				: routes.filter((route) => route.routeName.toLowerCase().includes(normalized));
		return [...filtered]
			.sort((first, second) => first.routeName.localeCompare(second.routeName))
			.slice(0, 8);
	}, [routes, normalized]);

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

export function parseLocalDate(value: string): Date | undefined {
	if (value === '') {
		return undefined;
	}
	const [yearPart, monthPart, dayPart] = value.slice(0, 10).split('-');
	if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
		return undefined;
	}
	const year = Number.parseInt(yearPart, 10);
	const month = Number.parseInt(monthPart, 10);
	const day = Number.parseInt(dayPart, 10);
	if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
		return undefined;
	}
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}
