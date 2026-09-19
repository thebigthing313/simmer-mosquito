import type { ControlType } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { resolveLinkedAddress } from '../../hooks/queries/address-view';
import type { SchemaCatalogListing } from '../../hooks/queries/catalog-roster-view';
import type {
	MissionProgressCounts,
	MissionStatus,
	MissionStop,
} from '../../hooks/queries/operations-view';
import { addressPrimaryLabel } from '../../lib/address-format';
import { calendarDateParts, utcCalendarDay } from '../../lib/local-date';
import { unreadable } from '../../lib/unreadable-input';

/**
 * The reads and writes behind the operations section: requested control
 * actions and missions. The queue and the schedule read through
 * `hooks/queries`; a page that writes a row reads it through the same
 * collection, or the write's txid lands on a stream nothing is watching.
 * Assignments keep their own module.
 */

// --- derived state ----------------------------------------------------------

/**
 * A mission needs somewhere to go before it can be dispatched. The server
 * enforces this (`checkStartMission`), so the button is disabled rather than
 * hidden.
 */
export function canStartMission(status: MissionStatus, counts: MissionProgressCounts): boolean {
	return status === 'scheduled' && counts.total > 0;
}

/** Every stop worked or passed over. Also enforced server-side. */
export function canCompleteMission(status: MissionStatus, counts: MissionProgressCounts): boolean {
	return status === 'inProgress' && counts.total > 0 && counts.pending === 0;
}

/** Stops are worked while the mission is running, and only then. */
export function canProgressMissionItems(status: MissionStatus): boolean {
	return status === 'inProgress';
}

/**
 * Recording the action a stop was dispatched for, which is a wider gate than
 * {@link canProgressMissionItems}: Done and Skip need a running mission, and
 * recording does not, because `autoStartMission` lets the crew's first record
 * of the day start the mission. See `docs/mission-dispatch-domain.md`.
 */
export function canRecordMissionStopWork(status: MissionStatus): boolean {
	return status === 'scheduled' || status === 'inProgress';
}

/** A finished mission is a record. Reopen it before changing what it covers. */
export function canEditMissionPlan(status: MissionStatus): boolean {
	return status === 'scheduled' || status === 'inProgress';
}

export type MissionItemAction = 'complete' | 'skip' | 'unskip' | 'reopen';

/**
 * The controls a stop offers, in the order the server resolves them.
 * `readItemLifecycleTransition` checks `skippedAt` before `completedAt`, so a
 * skipped stop is offered Unskip and never Complete.
 */
export function missionItemActionsFor(progress: MissionItemProgress): readonly MissionItemAction[] {
	if (progress === 'skipped') {
		return ['unskip'];
	}
	if (progress === 'completed') {
		return ['reopen'];
	}
	return ['complete', 'skip'];
}

/** Item progress. Skipped is checked first, matching `deriveMissionItemStatus`. */
export type MissionItemProgress = 'pending' | 'completed' | 'skipped';

export function missionItemProgress(row: {
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
}): MissionItemProgress {
	if (row.skippedAt !== null) {
		return 'skipped';
	}
	return row.completedAt === null ? 'pending' : 'completed';
}

export function missionProgressCounts(
	items: readonly { readonly completedAt: Date | null; readonly skippedAt: Date | null }[],
): MissionProgressCounts {
	let completed = 0;
	let skipped = 0;
	for (const item of items) {
		const progress = missionItemProgress(item);
		if (progress === 'completed') {
			completed += 1;
		} else if (progress === 'skipped') {
			skipped += 1;
		}
	}
	const handled = completed + skipped;
	return {
		total: items.length,
		completed,
		skipped,
		pending: items.length - handled,
		handled,
	};
}

// --- view models ------------------------------------------------------------

/** What names a stop drawn off a request. */
export interface MissionStopRequest {
	readonly id: string;
	readonly summary: string | null;
	readonly controlType: string;
}

/** One stop on a mission: its own place on the map, plus whatever names it. */
export interface MissionStopView {
	readonly missionItemId: string;
	/** 1-indexed place in the sequence, derived from `position` order at read time. */
	readonly ordinal: number;
	readonly position: number;
	readonly lat: number;
	readonly lng: number;
	/**
	 * The shape the stop was drawn as, once the display endpoint has answered.
	 * Null until then, and for a stop whose shape is a plain point.
	 */
	readonly geometry: GeoJsonGeometry | null;
	readonly requestedControlActionId: string | null;
	/**
	 * What the request this stop came from is called, once its row has streamed:
	 * the three fields anything showing a stop reads.
	 */
	readonly request: MissionStopRequest | null;
	readonly addressId: string | null;
	readonly addressLabel: string | null;
	readonly progress: MissionItemProgress;
	readonly skipReason: string | null;
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
	readonly hasLocation: boolean;
	/** A linked row is still streaming. False with no name means the link is gone. */
	readonly isResolving: boolean;
}

/**
 * A `date` column as the day it names, rebuilt in UTC where it cannot move.
 * `new Date('2026-08-04')` is UTC midnight, so naming a zone would introduce
 * the shift.
 */
export function formatOperationalDate(value: string): string {
	const parts = calendarDateParts(value);
	if (parts === undefined) {
		return unreadable('formatOperationalDate', value);
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(utcCalendarDay(parts));
}

// --- reads ------------------------------------------------------------------

export function toMissionStop(
	row: MissionStop,
	index: number,
	shapeById: ReadonlyMap<string, GeoJsonGeometry>,
	linksReady: boolean,
): MissionStopView {
	const address = resolveLinkedAddress(row.address);
	return {
		missionItemId: row.id,
		ordinal: index + 1,
		position: row.position,
		lat: row.latitude,
		lng: row.longitude,
		geometry: shapeById.get(row.id) ?? null,
		requestedControlActionId: row.requestedControlActionId,
		// Rebuilt from the projected columns rather than carried as a row: what names
		// a stop is a summary and a control type.
		request:
			row.requestedControlActionId === null
				? null
				: {
						id: row.requestedControlActionId,
						summary: row.requestSummary,
						controlType: row.requestControlType ?? '',
					},
		addressId: row.addressId,
		addressLabel: address === undefined ? null : addressPrimaryLabel(address),
		progress: missionItemProgress(row),
		skipReason: row.skipReason,
		completedAt: row.completedAt,
		skippedAt: row.skippedAt,
		// A stop always has ground of its own, so this is only ever false for a row
		// whose centroid has not arrived.
		hasLocation: Number.isFinite(row.latitude) && Number.isFinite(row.longitude),
		isResolving: !linksReady && (row.requestedControlActionId !== null || row.addressId !== null),
	};
}

/** Which of the four rosters a control type's method id points into. */
export function methodsForControlType(
	controlType: ControlType | '',
	rosters: {
		readonly applicationMethods: readonly SchemaCatalogListing[];
		readonly sourceReductionMethods: readonly SchemaCatalogListing[];
		readonly biocontrolMethods: readonly SchemaCatalogListing[];
		readonly outreachMethods: readonly SchemaCatalogListing[];
	},
): readonly SchemaCatalogListing[] {
	switch (controlType) {
		case 'application':
			return rosters.applicationMethods;
		case 'source_reduction':
			return rosters.sourceReductionMethods;
		case 'biocontrol':
			return rosters.biocontrolMethods;
		case 'outreach':
			return rosters.outreachMethods;
		default:
			return [];
	}
}

// --- writes -----------------------------------------------------------------
