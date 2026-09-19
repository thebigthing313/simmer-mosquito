import type { StopTone } from '../../../components/stop-order';
import type { AssignmentStatus, ProgressCounts } from '../../../hooks/queries/assignment-view';

/**
 * The reads behind a worklist run, and the rules about what may be done to one.
 *
 * The writes used to live here too. They are in `hooks/mutations` now
 * (`use-assignment-mutations.ts`, `use-assignment-item-mutations.ts`), because
 * they no longer depend on anything this module knows: the endpoint reads a
 * named command rather than inferring one from which timestamp moved, so the
 * ordering rules that used to make a write dangerous — details and lifecycle
 * must never ride the same PATCH; Complete must never be offered on a skipped
 * stop — are enforced by the command's name.
 *
 * {@link itemActionsFor} is the one that survives, and it is a display rule now
 * rather than a safety one: Unskip before Complete is the honest order to offer
 * a crew, not a fence around an inference.
 *
 * What is left is composition — the stops joined to the records they send a crew
 * to — which is a page's question rather than a table's, and stays beside the
 * pages that ask it.
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
 * The one place the polymorphic discriminator is interpreted.
 *
 * The column holds `service_request`; the vocabulary a page speaks is
 * `serviceRequest`. `trap` and `habitat` are single-word and identical either
 * way — which is exactly why an inline `=== 'serviceRequest'` comparison looks
 * correct until the first service-request stop appears.
 *
 * Both spellings are still accepted. The write side stamps the column's
 * (`use-assignment-item-mutations.ts`), so nothing this app produces is
 * camelCase any more, but a row written before that change still is.
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
 * {@link canProgressItems}.
 *
 * Done and Skip are progress commands and need a started assignment. Recording
 * does not: `autoStartAssignment` defaults true precisely so a technician who
 * opens the first stop of the day and files the record has started the
 * assignment by doing so, and the server permits it (`checkExecution` allows
 * `not_started` on the auto-start path). Sharing the progress gate here made
 * that unreachable — the crew had to press Start first, which is the tap the
 * auto-start exists to remove. See `docs/field-work-support-domain.md`,
 * "Assignment Item Execution".
 */
export function canRecordStopWork(status: AssignmentStatus): boolean {
	return status === 'notStarted' || status === 'inProgress';
}

/**
 * The server does not enforce these preconditions (issue #39), so this is the only
 * thing standing between a mis-click and an assignment completed with pending work.
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
	 * On a trap stop, the collection already out on that trap, if there is one.
	 *
	 * Its presence is what makes this visit the *second* of a two-visit trap: the
	 * stop is here to empty a trap somebody set earlier, not to set a new one.
	 * Null on every other kind of stop and on a trap with nothing out.
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
 * The controls a stop offers, in the order a crew should meet them.
 *
 * Unskip before Complete on a skipped stop. This used to be a safety rule: the
 * old PATCH resolved `skipped_at` before `completed_at`, so offering Complete on
 * a skipped stop produced a write that read as a skip and left the row looking
 * skipped until sync corrected it. The commands are named now, so Complete on a
 * skipped stop would be honoured — it is still not offered, because "unskip,
 * then work it" is the sequence that matches what actually happened in the
 * field.
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
