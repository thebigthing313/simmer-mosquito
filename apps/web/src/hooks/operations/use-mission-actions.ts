import type {
	MissionItemAction,
	MissionStopView,
} from '../../components/operations/operations-data';
import type { MoveAction } from '../../components/stop-order';
import type { MissionItemMutations } from '../mutations/use-mission-item-mutations';
import type { useMissionMutations } from '../mutations/use-mission-mutations';
import type { CommandRunner } from '../operations/use-command-runner';
import type { OpenRequest } from '../queries/operations-view';
import type { MissionSelection } from './use-mission-selection';

export interface MissionActions {
	readonly start: () => void;
	readonly complete: () => void;
	readonly reopen: () => void;
	readonly confirmCancel: (reason: string) => void;
	readonly confirmReopen: (reason: string) => void;
	readonly itemAction: (stop: MissionStopView, action: MissionItemAction) => void;
	readonly confirmSkip: (reason: string) => void;
	readonly confirmRemove: () => void;
	readonly move: (index: number, action: MoveAction) => void;
	readonly addStop: (request: OpenRequest) => void;
}

/**
 * The mission page's writes, each run through the command runner: the
 * lifecycle transitions, the stop transitions, reordering and adding a stop.
 */
export function useMissionActions({
	missionId,
	organizationId,
	stops,
	moveStop,
	selection,
	runner,
	missionWrites,
	stopWrites,
}: {
	readonly missionId: string;
	readonly organizationId: string | null;
	readonly stops: readonly MissionStopView[];
	readonly moveStop: (index: number, action: MoveAction) => Promise<void>;
	readonly selection: MissionSelection;
	readonly runner: CommandRunner;
	readonly missionWrites: ReturnType<typeof useMissionMutations>;
	readonly stopWrites: MissionItemMutations;
}): MissionActions {
	const { run } = runner;
	const { skipTarget, setSkipTarget, removeTarget, setRemoveTarget, setCancelOpen, setReopenOpen } =
		selection;

	const itemAction = (stop: MissionStopView, action: MissionItemAction) => {
		if (action === 'skip') {
			setSkipTarget(stop);
			return;
		}
		void run(
			() => progressStop(stopWrites, stop.missionItemId, action),
			'Unable to update that stop.',
		);
	};

	const confirmSkip = (reason: string) => {
		const target = skipTarget;
		setSkipTarget(null);
		if (target === null) {
			return;
		}
		void run(() => stopWrites.skip(target.missionItemId, reason), 'Unable to skip that stop.');
	};

	const confirmRemove = () => {
		const target = removeTarget;
		setRemoveTarget(null);
		if (target === null) {
			return;
		}
		void run(() => stopWrites.removeStop(target.missionItemId), 'Unable to remove that stop.');
	};

	const confirmCancel = (reason: string) => {
		setCancelOpen(false);
		// The command requires a reason and the dialog does not, so an empty box
		// is sent as the plain fact rather than as a validation failure.
		const trimmed = reason.trim();
		void run(
			() => missionWrites.cancel(missionId, trimmed.length === 0 ? 'Cancelled' : trimmed),
			'Unable to cancel this mission.',
		);
	};

	const confirmReopen = (reason: string) => {
		setReopenOpen(false);
		// Same bargain as cancelling: the command requires text and the dialog does
		// not, so an empty box becomes the plain fact rather than a refused reopen.
		const trimmed = reason.trim();
		void run(
			() => missionWrites.reopen(missionId, trimmed.length === 0 ? 'Reopened' : trimmed),
			'Unable to reopen this mission.',
		);
	};

	const addStop = (request: OpenRequest) => {
		if (organizationId === null) {
			return;
		}
		void run(
			() =>
				stopWrites.addFromRequest({
					missionId,
					request: {
						requestedControlActionId: request.id,
						lat: request.latitude,
						lng: request.longitude,
						geomType: request.geometryKind,
					},
					position: stops.reduce((max, stop) => Math.max(max, stop.position), -1) + 1,
				}),
			'Unable to add that stop.',
		);
	};

	return {
		start: () => void run(() => missionWrites.start(missionId), 'Unable to start this mission.'),
		complete: () =>
			void run(() => missionWrites.complete(missionId), 'Unable to complete this mission.'),
		reopen: () => setReopenOpen(true),
		confirmCancel,
		confirmReopen,
		itemAction,
		confirmSkip,
		confirmRemove,
		move: (index: number, action: MoveAction) => {
			void run(() => moveStop(index, action), 'Unable to reorder the mission.');
		},
		addStop,
	};
}

/** The three stop transitions that need no extra input. Skip collects a reason. */
function progressStop(
	writes: MissionItemMutations,
	missionItemId: string,
	action: Exclude<MissionItemAction, 'skip'>,
): Promise<void> {
	if (action === 'complete') {
		return writes.complete(missionItemId);
	}
	return action === 'unskip' ? writes.unskip(missionItemId) : writes.reopen(missionItemId);
}

/** The control actions the stops have already requested. */
export function requestedActionIds(stops: readonly MissionStopView[]): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const stop of stops) {
		if (stop.requestedControlActionId !== null) {
			ids.add(stop.requestedControlActionId);
		}
	}
	return ids;
}
