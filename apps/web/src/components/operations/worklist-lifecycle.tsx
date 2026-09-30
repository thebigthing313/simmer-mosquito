import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { recordNoun } from '../../lib/record-nouns';
import type { DetailAction } from '../record/detail-page-header';

const StartIcon = iconRegistry.arrows.arrowRight.icon;
const CompleteIcon = iconRegistry.generic.success.icon;
const CancelIcon = iconRegistry.actions.close.icon;
const ReopenIcon = iconRegistry.actions.reset.icon;

/**
 * Where a worklist stands, in the terms its lifecycle commands care about.
 *
 * A mission says `scheduled` and an assignment `notStarted` for the first, and
 * both end as `completed` or `cancelled`, so each page maps its own status
 * onto this rather than the builder learning both vocabularies.
 */
export type WorklistPhase = 'notStarted' | 'inProgress' | 'ended';

/** What a worklist page hands {@link worklistLifecycleActions}. */
export interface WorklistLifecycle {
	/** The record the items name, which is the noun after the verb. */
	readonly recordType: 'mission' | 'assignment';
	readonly phase: WorklistPhase;
	/** A write is in flight; every item is disabled until it settles. */
	readonly busy: boolean;
	/** Start's precondition, which disables the item rather than hiding it. */
	readonly canStart: boolean;
	/** Complete's precondition, likewise. */
	readonly canComplete: boolean;
	readonly onStart: () => void;
	readonly onComplete: () => void;
	/** Opens the cancel reason dialog. */
	readonly onCancel: () => void;
	/**
	 * Opens the reopen reason dialog on a mission. An assignment's reopen takes
	 * no reason, so there it is the write.
	 */
	readonly onReopen: () => void;
}

/**
 * The lifecycle items for a worklist's `...` menu, one set per phase: Start or
 * Complete, then Cancel, while the work is open, and Reopen once it has ended.
 *
 * Start and Complete are at the collector floor, since whoever the work is
 * assigned to runs it, and stay in the menu disabled when their precondition
 * fails. Cancel and Reopen are at the manager floor. The menu drops whatever
 * the signed-in role cannot reach.
 */
export function worklistLifecycleActions(lifecycle: WorklistLifecycle): readonly DetailAction[] {
	const noun = recordNoun(lifecycle.recordType).title;
	if (lifecycle.phase === 'ended') {
		return [
			{
				disabled: lifecycle.busy,
				icon: ReopenIcon,
				id: 'reopen',
				label: `Reopen ${noun}`,
				minimum: 'manager',
				onSelect: lifecycle.onReopen,
			},
		];
	}
	const progress: DetailAction =
		lifecycle.phase === 'notStarted'
			? {
					disabled: lifecycle.busy || !lifecycle.canStart,
					icon: StartIcon,
					id: 'start',
					label: `Start ${noun}`,
					onSelect: lifecycle.onStart,
				}
			: {
					disabled: lifecycle.busy || !lifecycle.canComplete,
					icon: CompleteIcon,
					id: 'complete',
					label: `Complete ${noun}`,
					onSelect: lifecycle.onComplete,
				};
	return [
		progress,
		{
			disabled: lifecycle.busy,
			icon: CancelIcon,
			id: 'cancel',
			label: `Cancel ${noun}`,
			minimum: 'manager',
			onSelect: lifecycle.onCancel,
		},
	];
}

/**
 * "3 stops still pending", under the header of a worklist that is running and
 * has stops left, or nothing. It is what a disabled Complete cannot say.
 */
export function PendingStopsHint({
	phase,
	pending,
}: {
	readonly phase: WorklistPhase;
	readonly pending: number;
}) {
	if (phase !== 'inProgress' || pending === 0) {
		return null;
	}
	return (
		<p className="m-0 text-muted-foreground text-xs">
			{pending === 1 ? '1 stop still pending' : `${pending} stops still pending`}
		</p>
	);
}
