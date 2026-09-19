import type { AssignmentStatus, ProgressCounts } from '../../../hooks/queries/assignment-view';
import type { StopTone } from '../../stop-order';

/**
 * The reads behind a worklist run, and the rules about what may be done to
 * one. The writes are in `hooks/mutations` (`use-assignment-mutations.ts`,
 * `use-assignment-item-mutations.ts`), where the command's name enforces the
 * ordering. {@link itemActionsFor} is a display rule: Unskip before Complete
 * is the order to offer a crew.
 */

/** Radix Select forbids an empty-string item value, so "nobody" needs a name. */
export const NO_ASSIGNEE = 'none';

// --- derived state ----------------------------------------------------------

export type ItemProgress = 'pending' | 'completed' | 'skipped';
export type TargetType = 'trap' | 'habitat' | 'serviceRequest';

/** Item progress. Skipped is checked first, matching the server's own precedence. */
export function itemProgress(row: {
	readonly completedAt: Date | string | null;
	readonly skippedAt: Date | string | null;
}): ItemProgress {
	if (row.skippedAt !== null) {
		return 'skipped';
	}
	return row.completedAt === null ? 'pending' : 'completed';
}

/**
 * The one place the polymorphic discriminator is interpreted. The column holds
 * `service_request`; the vocabulary a page speaks is `serviceRequest`. Both
 * spellings are accepted, because a row written before the write side stamped
 * the column's spelling is still camelCase.
 */
export function targetTypeOf(entityType: string): TargetType | null {
	switch (entityType) {
		case 'trap':
		case 'habitat':
			return entityType;
		case 'serviceRequest':
		case 'service_request':
			return 'serviceRequest';
		default:
			return null;
	}
}

export function progressCounts(
	items: readonly { readonly progress: ItemProgress }[],
): ProgressCounts {
	let completed = 0;
	let skipped = 0;
	for (const item of items) {
		if (item.progress === 'completed') {
			completed += 1;
		} else if (item.progress === 'skipped') {
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

export function canStartAssignment(status: AssignmentStatus, counts: ProgressCounts): boolean {
	return status === 'notStarted' && counts.total > 0;
}

export function canProgressItems(status: AssignmentStatus): boolean {
	return status === 'inProgress';
}

/**
 * Recording the work a stop was created for, which is a wider gate than
 * {@link canProgressItems}: Done and Skip need a started assignment, and
 * recording does not, because `autoStartAssignment` lets a technician start
 * the assignment by filing the first record (`checkExecution` allows
 * `not_started` on the auto-start path). See
 * `docs/field-work-support-domain.md`, "Assignment Item Execution".
 */
export function canRecordStopWork(status: AssignmentStatus): boolean {
	return status === 'notStarted' || status === 'inProgress';
}

/**
 * The server does not enforce these preconditions, so this is what
 * stands between a mis-click and an assignment completed with pending work.
 */
export function canCompleteAssignment(status: AssignmentStatus, counts: ProgressCounts): boolean {
	return status === 'inProgress' && counts.total > 0 && counts.pending === 0;
}

export function canEditPlan(status: AssignmentStatus): boolean {
	return status === 'notStarted' || status === 'inProgress';
}

// --- view models ------------------------------------------------------------

export interface AssignmentTarget {
	readonly type: TargetType;
	readonly id: string;
	readonly name: string;
	readonly secondary: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
	/** Active trap / active habitat / open request. Retired targets still display. */
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}

export interface AssignmentStopView {
	readonly assignmentItemId: string;
	/** 1-indexed place in the sequence, derived from `position` order at read time. */
	readonly ordinal: number;
	readonly position: number;
	readonly entityType: TargetType | null;
	readonly entityId: string;
	readonly directionsToNextItem: string | null;
	readonly completedAt: Date | null;
	readonly completedByProfileId: string | null;
	readonly skippedAt: Date | null;
	readonly skippedByProfileId: string | null;
	readonly skipReason: string | null;
	readonly progress: ItemProgress;
	readonly target: AssignmentTarget | null;
	readonly hasLocation: boolean;
	/** The target row is still streaming. False with a null target means deleted. */
	readonly isResolving: boolean;
	/**
	 * On a trap stop, the collection already out on that trap, if there is one:
	 * this visit is the second of a two-visit trap. Null on every other kind of
	 * stop and on a trap with nothing out.
	 */
	readonly pendingCollectionId: string | null;
}

/** An assignment as the run and plan pages read it. */
export interface AssignmentView {
	readonly id: string;
	readonly assignmentName: string | null;
	readonly assignmentDate: string;
	readonly assignedToProfileId: string | null;
	readonly dueAt: Date | null;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
	readonly cancellationReason: string | null;
	readonly status: AssignmentStatus;
}

/** Pin colour reports progress on the work, not the state of the site. */
export function assignmentStopTone(stop: AssignmentStopView): StopTone {
	if (stop.progress === 'skipped') {
		return 'skipped';
	}
	if (stop.progress === 'completed') {
		return 'done';
	}
	return 'default';
}

/**
 * The controls a stop offers, in the order a crew should meet them: Unskip
 * before Complete on a skipped stop, because "unskip, then work it" is the
 * sequence that matches what happened in the field.
 */
export function itemActionsFor(progress: ItemProgress): readonly ItemAction[] {
	if (progress === 'skipped') {
		return ['unskip'];
	}
	if (progress === 'completed') {
		return ['reopen'];
	}
	return ['complete', 'skip'];
}

export type ItemAction = 'complete' | 'skip' | 'unskip' | 'reopen';
