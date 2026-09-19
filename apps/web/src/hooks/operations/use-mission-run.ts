import type { MovePlan } from '../../components/stop-order';
import {
	canCompleteMission,
	canEditMissionPlan,
	canProgressMissionItems,
	canRecordMissionStopWork,
	canStartMission,
	type MissionStopView,
} from '../../routes/operations/-operations-data';
import { missionStopFeatures } from '../../routes/operations/-operations-display';
import type { RouteStopFeature } from '../map/use-route-layer';
import { useMissionItemMutations } from '../mutations/use-mission-item-mutations';
import { useMissionMutations } from '../mutations/use-mission-mutations';
import { useCommandRunner } from '../operations/use-command-runner';
import { useMissionStopViews } from '../operations/use-mission-stop-views';
import type { MissionProgressCounts, MissionStatus } from '../queries/operations-view';
import { type MissionRecord, useMission } from '../queries/use-mission';
import { useStopOrder } from '../stop-order/use-stop-order';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { useHasRole } from '../use-can-write';
import { type MissionActions, requestedActionIds, useMissionActions } from './use-mission-actions';
import { useMissionLabels } from './use-mission-labels';
import { type MissionSelection, useMissionSelection } from './use-mission-selection';

/** Module-level so the ordering hook's identity stays stable across renders. */
const stopKey = (stop: MissionStopView) => stop.missionItemId;

/**
 * Everything the mission detail page holds: the mission, its labels, its
 * ordered stops, what the page has selected, what it may offer, and the writes.
 */
export interface MissionRun extends MissionSelection, MissionActions {
	readonly mission: MissionRecord | null;
	readonly isReady: boolean;
	readonly displayName: string | null;
	readonly assigneeName: string | null;
	readonly methodName: string | null;

	/** Stops in the order the page shows them — the pending reorder, if one is live. */
	readonly stops: readonly MissionStopView[];
	readonly features: readonly RouteStopFeature[];
	readonly counts: MissionProgressCounts;
	readonly isLoadingStops: boolean;
	/** The requests already on this mission, so the picker can drop them. */
	readonly existingRequestIds: ReadonlySet<string>;
	readonly organizationId: string | null;

	readonly busy: boolean;

	readonly canStart: boolean;
	readonly canComplete: boolean;
	/** Stops may be worked: the mission is running and nothing is in flight. */
	readonly progressEnabled: boolean;
	/** Wider: recording is also allowed on a scheduled mission, which it starts. */
	readonly recordEnabled: boolean;
	/** Stops may be added, reordered, or removed. */
	readonly planEditable: boolean;
	readonly canAddStops: boolean;
}

/**
 * The mission detail page's state: the record, its labels, the ordered stops
 * with any pending reorder, the selection, the capabilities and the actions.
 */
export function useMissionRun(missionId: string): MissionRun {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const canPlan = useHasRole('manager');

	// `null` rather than the query seam's `undefined`: everything on this page
	// reads "no mission" as an explicit absence, and the run page distinguishes it
	// from "not loaded yet" with `isReady`.
	const { mission, isReady } = useMission(missionId);
	const missionOrNull = mission ?? null;
	const { stops, counts, isLoading } = useMissionStopViews(missionId);
	const labels = useMissionLabels(missionOrNull);

	const selection = useMissionSelection();
	const runner = useCommandRunner();

	const missionWrites = useMissionMutations();

	// The whole plan, not just the moved id: the write mirrors the server's own
	// renumbering onto the stop rows, and a caller writing optimistic positions
	// needs the order to write them in.
	const commitMove = (plan: MovePlan) => missionWrites.moveStops(missionId, plan);
	const { ordered, move: moveStop } = useStopOrder({
		items: stops,
		keyOf: stopKey,
		commit: commitMove,
	});

	const actions = useMissionActions({
		missionId,
		organizationId,
		stops,
		moveStop,
		selection,
		runner,
		missionWrites,
		stopWrites: useMissionItemMutations(),
	});

	// The map numbers the stops by the *pending* order rather than the synced one,
	// so a reorder renumbers the pins on the same frame the list rearranges.
	const features = missionStopFeatures(ordered);
	const existingRequestIds = requestedActionIds(stops);

	return {
		mission: missionOrNull,
		isReady,
		...labels,

		stops: ordered,
		features,
		counts,
		isLoadingStops: isLoading,
		existingRequestIds,
		organizationId,

		busy: runner.busy,

		...missionCapabilities({
			status: mission?.status ?? null,
			counts,
			canPlan,
			hasOrganization: organizationId !== null,
			busy: runner.busy,
		}),

		...selection,
		...actions,
	};
}

interface MissionCapabilities {
	readonly canStart: boolean;
	readonly canComplete: boolean;
	readonly progressEnabled: boolean;
	readonly recordEnabled: boolean;
	readonly planEditable: boolean;
	readonly canAddStops: boolean;
}

/** What the page may offer, given where the mission is and who is looking. */
function missionCapabilities(input: {
	readonly status: MissionStatus | null;
	readonly counts: MissionProgressCounts;
	readonly canPlan: boolean;
	readonly hasOrganization: boolean;
	readonly busy: boolean;
}): MissionCapabilities {
	const { status, counts, busy } = input;
	if (status === null) {
		return {
			canStart: false,
			canComplete: false,
			progressEnabled: false,
			recordEnabled: false,
			planEditable: false,
			canAddStops: false,
		};
	}

	const planEditable = canEditMissionPlan(status) && input.canPlan;
	return {
		canStart: canStartMission(status, counts),
		canComplete: canCompleteMission(status, counts),
		progressEnabled: canProgressMissionItems(status) && !busy,
		// Wider on purpose: recording auto-starts the mission.
		recordEnabled: canRecordMissionStopWork(status) && !busy,
		planEditable,
		canAddStops: planEditable && input.hasOrganization && !busy,
	};
}
