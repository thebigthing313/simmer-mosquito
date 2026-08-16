/**
 * What the assignment surfaces read a worklist as.
 *
 * An assignment is a day's field work for one crew member: a date, an assignee,
 * and an ordered list of places to visit. The stops themselves are a separate
 * read — they mix traps, habitats, and service requests, and resolving them is a
 * different question from listing the worklists.
 *
 * Status is derived rather than projected, for the reason spelled out in
 * `operations-view.ts`: three nullable timestamps, in the precedence the server
 * resolves them, written once.
 */

/** Where a worklist is in its life. Derived from timestamps — there is no column. */
export type AssignmentStatus = 'notStarted' | 'inProgress' | 'completed' | 'cancelled';

export const ASSIGNMENT_STATUS_LABELS: Readonly<Record<AssignmentStatus, string>> = {
	notStarted: 'Not started',
	inProgress: 'In progress',
	completed: 'Completed',
	cancelled: 'Cancelled',
};

/** An assignment as the schedule and the overview read it. */
export interface AssignmentListing {
	readonly id: string;
	readonly assignmentName: string | null;
	readonly assignmentDate: string;
	readonly assignedToProfileId: string | null;
	readonly dueAt: Date | null;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
}

/**
 * The three timestamps as one state.
 *
 * The precedence deliberately matches the server's `readLifecycleTransition`
 * rather than the intuitive reading, so a row that somehow carries two terminal
 * timestamps can never render as one state while PATCHing as another.
 *
 * Widened to accept a string because the run pages still read raw Electric rows,
 * where a `timestamptz` has not been parsed. Only nullness is read either way.
 */
export function assignmentStatus(row: {
	readonly startedAt: Date | string | null;
	readonly completedAt: Date | string | null;
	readonly cancelledAt: Date | string | null;
}): AssignmentStatus {
	if (row.completedAt !== null) {
		return 'completed';
	}
	if (row.cancelledAt !== null) {
		return 'cancelled';
	}
	return row.startedAt === null ? 'notStarted' : 'inProgress';
}

/** How far through its stops a worklist is. */
export interface ProgressCounts {
	readonly total: number;
	readonly completed: number;
	readonly skipped: number;
	readonly pending: number;
	/** Completed or skipped — the two ways a stop is done being worked. */
	readonly handled: number;
}

export function assignmentDisplayName(
	row: { readonly assignmentName: string | null; readonly assignmentDate: string },
	assigneeName: string | null,
): string {
	const name = row.assignmentName?.trim();
	if (name) {
		return name;
	}
	return assigneeName === null ? row.assignmentDate : `${row.assignmentDate} — ${assigneeName}`;
}

export function formatAssignmentDate(date: string): string {
	// `assignmentDate` is an agency-local calendar date, so it is split rather than
	// parsed — `new Date('2026-08-04')` is UTC midnight and shifts a day west of it.
	const [year, month, day] = date.split('-').map(Number);
	if (year === undefined || month === undefined || day === undefined) {
		return date;
	}
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

/**
 * A due time, shown only when one is set, on the agency's clock.
 *
 * `dueAt` is an instant; "due 4pm" is only a fact once a zone says which 4pm.
 * A worklist due at end of shift has to read the same to the crew working it
 * and to the supervisor checking on it from elsewhere.
 *
 * The opposite treatment to {@link formatAssignmentDate} directly above it, and
 * deliberately: `assignment_date` is a `date` column and names a day, `due_at` is
 * a `timestamptz` and names a moment. Naming a zone for the first would introduce
 * the shift that naming one for the second removes.
 */
export function formatDueAt(
	dueAt: Date | string | null,
	timeZone: string | undefined,
): string | null {
	if (dueAt === null) {
		return null;
	}
	const parsed = dueAt instanceof Date ? dueAt : new Date(dueAt);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}
	return parsed.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone === undefined ? {} : { timeZone }),
	});
}
