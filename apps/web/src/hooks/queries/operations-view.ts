/**
 * What the operations surfaces read a request and a mission as.
 *
 * Two records rather than one because they are two halves of the same sentence:
 * a request is control work somebody asked for, a mission is the trip dispatched
 * to do it, and a mission may cover several requests or none. What they share is
 * the control type, which is why the vocabulary sits here rather than in either.
 *
 * ## Status is derived, not projected
 *
 * Neither table has a status column — both derive one from nullable timestamps,
 * in a precedence that has to match the server's own read or a row renders as one
 * state while writing as another. That derivation stays a function called at the
 * point of use rather than a `caseWhen` in each query: it is the same three
 * comparisons everywhere, and spelling it twice is how the two copies drift.
 *
 * So the projections carry the timestamps and the callers call {@link
 * missionStatus} / {@link requestStatus}. The write surfaces derive the same
 * status from their own rows through the same functions, which is what keeps the
 * queue and the detail page agreeing about what is finished.
 */

import type { ControlType } from '@simmer-mosquito/sync';

/**
 * The four kinds of control work a request or mission can be for.
 *
 * The column stores the snake_case `control_type` enum; these are the labels the
 * operator reads. Ordered as the domain lists them, not alphabetically.
 */
export const CONTROL_TYPES: readonly ControlType[] = [
	'application',
	'source_reduction',
	'biocontrol',
	'outreach',
];

const CONTROL_TYPE_LABELS: Readonly<Record<ControlType, string>> = {
	application: 'Application',
	source_reduction: 'Source Reduction',
	biocontrol: 'Biocontrol',
	outreach: 'Outreach',
};

export function controlTypeLabel(controlType: string): string {
	return CONTROL_TYPE_LABELS[controlType as ControlType] ?? controlType;
}

// --- requests ---------------------------------------------------------------

/**
 * A request is open until someone resolves it. There is no status column and no
 * intermediate state: resolution can mean handled, duplicate, or not feasible,
 * and which of those it was lives in the comments.
 */
export type RequestStatus = 'open' | 'resolved';

/**
 * A request as the queue and the overview read it.
 *
 * `lat`/`lng` are the synced centroid, which is all a queue needs — it plots a
 * pin per request. The drawn shape is served by `/map/*` and only the detail page
 * asks for it.
 */
export interface RequestListing {
	readonly id: string;
	readonly controlType: string;
	readonly summary: string | null;
	readonly recommendedMethodId: string | null;
	readonly requestedByProfileId: string | null;
	readonly requestedAt: Date;
	readonly resolvedAt: Date | null;
	readonly lat: number;
	readonly lng: number;
}

/** Open or resolved, from the one nullable timestamp that decides it. */
export function requestStatus(row: { readonly resolvedAt: Date | string | null }): RequestStatus {
	return row.resolvedAt === null ? 'open' : 'resolved';
}

/** A request's one-line subject: its own summary, or the control type it asks for. */
export function requestDisplayName(row: {
	readonly summary: string | null;
	readonly controlType: string;
}): string {
	const summary = row.summary?.trim();
	return summary || `${controlTypeLabel(row.controlType)} requested`;
}

// --- missions ---------------------------------------------------------------

/**
 * Mission lifecycle, derived from timestamps — there is no status column.
 *
 * The precedence matches `deriveMissionLifecycleStatus` in the domain and the
 * server's own read, so a row carrying two terminal timestamps can never render
 * as one state while writing as another.
 */
export type MissionStatus = 'scheduled' | 'inProgress' | 'completed' | 'cancelled';

export const MISSION_STATUS_LABELS: Readonly<Record<MissionStatus, string>> = {
	scheduled: 'Scheduled',
	inProgress: 'In progress',
	completed: 'Completed',
	cancelled: 'Cancelled',
};

/**
 * A mission as the schedule and the overview read it.
 *
 * Missions carry no geometry of their own — a mission's footprint is the union of
 * its stops — so nothing here locates one. The map pages draw the selected
 * mission's items instead.
 */
export interface MissionListing {
	readonly id: string;
	readonly missionName: string | null;
	readonly controlType: string;
	readonly plannedMethodId: string | null;
	readonly assignedToProfileId: string | null;
	readonly scheduledStartAt: Date;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
}

/**
 * The three timestamps as one state.
 *
 * Widened to accept a string because the write surfaces still read raw Electric
 * rows, where a `timestamptz` has not been parsed. Only nullness is read either
 * way, so one function serves both.
 */
export function missionStatus(row: {
	readonly startedAt: Date | string | null;
	readonly completedAt: Date | string | null;
	readonly cancelledAt: Date | string | null;
}): MissionStatus {
	if (row.completedAt !== null) {
		return 'completed';
	}
	if (row.cancelledAt !== null) {
		return 'cancelled';
	}
	return row.startedAt === null ? 'scheduled' : 'inProgress';
}

/** A mission's name, falling back to what the mission is and when it runs. */
export function missionDisplayName(
	row: {
		readonly missionName: string | null;
		readonly controlType: string;
		readonly scheduledStartAt: Date | string;
	},
	timeZone: string | undefined,
): string {
	const name = row.missionName?.trim();
	if (name) {
		return name;
	}
	// An unnamed mission is named by when it runs, so the fallback carries the
	// same zone the scheduled start is read in everywhere else.
	return `${controlTypeLabel(row.controlType)} — ${formatScheduledStart(row.scheduledStartAt, timeZone)}`;
}

// --- progress ---------------------------------------------------------------

/** How far through its stops a mission is. */
export interface MissionProgressCounts {
	readonly total: number;
	readonly completed: number;
	readonly skipped: number;
	readonly pending: number;
	/** Completed or skipped — the two ways a stop is done being worked. */
	readonly handled: number;
}

// --- formatting -------------------------------------------------------------

/**
 * When a mission is due to start, on the agency's clock.
 *
 * `scheduledStartAt` is an instant, and an instant has no time of day until a
 * zone is named. A dispatcher two zones from the yard has to read the same 6am
 * muster as the crew standing in it, so the zone is the agency's.
 *
 * A string is still accepted: the write surfaces read raw Electric rows, where
 * the column arrives unparsed.
 */
export function formatScheduledStart(value: Date | string, timeZone: string | undefined): string {
	const parsed = asInstant(value);
	if (parsed === null) {
		return typeof value === 'string' ? value : '';
	}
	return parsed.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone === undefined ? {} : { timeZone }),
	});
}

/** The day a request came in, on the agency's calendar. See {@link formatScheduledStart}. */
export function formatRequestedAt(value: Date | string, timeZone: string | undefined): string {
	const parsed = asInstant(value);
	if (parsed === null) {
		return typeof value === 'string' ? value : '';
	}
	return parsed.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		...(timeZone === undefined ? {} : { timeZone }),
	});
}

/**
 * A column value as the instant it names, or null if it names none.
 *
 * The one place the two forms of a `timestamptz` meet: parsed to a `Date` on a
 * collection with a row schema, still a string on one without. An unreadable
 * string is null rather than an Invalid Date, so a caller prints what it was
 * given instead of "Invalid Date".
 */
function asInstant(value: Date | string): Date | null {
	const parsed = value instanceof Date ? value : new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}
