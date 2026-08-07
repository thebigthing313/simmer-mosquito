import type { RequestedControlActionRow } from '@simmer-mosquito/sync';
import { useCallback, useMemo, useState } from 'react';
import { usePersonnelOptions } from '../../../components/explorer';
import type { RouteStopFeature } from '../../../components/map';
import { type MoveAction, type OrderPlacement, useStopOrder } from '../../../components/stop-order';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useHasRole } from '../../../hooks/use-can-write';
import { type CommandRunner, useCommandRunner } from '../-command-runner';
import {
	addMissionItemFromRequest,
	canCompleteMission,
	cancelMission,
	canEditMissionPlan,
	canProgressMissionItems,
	canStartMission,
	completeMission,
	completeMissionItem,
	type MissionItemAction,
	type MissionProgressCounts,
	type MissionStatus,
	type MissionStopView,
	type MissionView,
	missionDisplayName,
	moveMissionItems,
	removeMissionItem,
	reopenMission,
	reopenMissionItem,
	skipMissionItem,
	startMission,
	unskipMissionItem,
	useAllControlMethodNames,
	useMission,
	useMissionStops,
} from '../-operations-data';
import { missionStopFeatures } from '../-operations-display';

/** Module-level so the ordering hook's identity stays stable across renders. */
const stopKey = (stop: MissionStopView) => stop.missionItemId;

/**
 * Everything the mission detail page holds.
 *
 * A mission page is two jobs at once — working the stops and planning them — and
 * between them they need a dozen pieces of state that only ever change together:
 * which stop the map has selected, which one a dialog is asking about, whether a
 * write is in flight, and what went wrong if one did. Left inline they put more
 * than twenty hooks in the route component and buried the rendering.
 *
 * `planEditable` folds the manager floor in, because the controls it gates —
 * adding, reordering, and removing stops — sit inside the stop list rather than
 * behind a `WriteOnly` wrapper of their own. Progress is left ungated here: it
 * belongs to the assigned collector, which is a fact about the mission the
 * server checks, not one the browser can settle.
 */
export interface MissionRun extends MissionSelection, MissionActions {
	readonly mission: MissionView | null;
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
	readonly error: string | null;

	readonly canStart: boolean;
	readonly canComplete: boolean;
	/** Stops may be worked: the mission is running and nothing is in flight. */
	readonly progressEnabled: boolean;
	/** Stops may be added, reordered, or removed. */
	readonly planEditable: boolean;
	readonly canAddStops: boolean;
}

export function useMissionRun(missionId: string): MissionRun {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;
	const canPlan = useHasRole('manager');

	const { mission, isReady } = useMission(missionId);
	const { stops, counts, isLoading } = useMissionStops(missionId);
	const labels = useMissionLabels(mission);

	const selection = useMissionSelection();
	const runner = useCommandRunner();

	const commitMove = useCallback(
		(movedIds: readonly string[], placement: OrderPlacement) =>
			moveMissionItems(missionId, movedIds, placement),
		[missionId],
	);
	const { ordered, move: moveStop } = useStopOrder({
		items: stops,
		keyOf: stopKey,
		commit: commitMove,
	});

	const actions = useMissionActions({
		missionId,
		organizationId,
		actorProfileId,
		stops,
		moveStop,
		selection,
		runner,
	});

	const features = useOrderedFeatures(ordered);
	const existingRequestIds = useExistingRequestIds(stops);

	return {
		mission,
		isReady,
		...labels,

		stops: ordered,
		features,
		counts,
		isLoadingStops: isLoading,
		existingRequestIds,
		organizationId,

		busy: runner.busy,
		error: runner.error,

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

// --- labels -----------------------------------------------------------------

interface MissionLabels {
	readonly displayName: string | null;
	readonly assigneeName: string | null;
	readonly methodName: string | null;
}

/**
 * The three names the page reads off catalogs rather than off the mission row.
 *
 * `plannedMethodId` is polymorphic by control type, so it resolves through the
 * combined map rather than the one catalog the mission's type names — an id that
 * no longer matches its type still labels itself.
 */
function useMissionLabels(mission: MissionView | null): MissionLabels {
	const { nameById } = usePersonnelOptions();
	const methodNameById = useAllControlMethodNames();

	return {
		displayName: mission === null ? null : missionDisplayName(mission),
		assigneeName: lookup(nameById, mission?.assignedToProfileId),
		methodName: lookup(methodNameById, mission?.plannedMethodId),
	};
}

/** A catalog name by id, tolerating both "no id" and "id that resolves to nothing". */
function lookup(names: ReadonlyMap<string, string>, id: string | null | undefined): string | null {
	return id == null ? null : (names.get(id) ?? null);
}

// --- capabilities -----------------------------------------------------------

interface MissionCapabilities {
	readonly canStart: boolean;
	readonly canComplete: boolean;
	readonly progressEnabled: boolean;
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
			planEditable: false,
			canAddStops: false,
		};
	}

	const planEditable = canEditMissionPlan(status) && input.canPlan;
	return {
		canStart: canStartMission(status, counts),
		canComplete: canCompleteMission(status, counts),
		progressEnabled: canProgressMissionItems(status) && !busy,
		planEditable,
		canAddStops: planEditable && input.hasOrganization && !busy,
	};
}

// --- selection --------------------------------------------------------------

/** What the page has picked out: on the map, and in whatever dialog is open. */
interface MissionSelection {
	readonly selectedStopId: string | null;
	readonly setSelectedStopId: (id: string | null) => void;
	readonly highlightId: string | null;
	readonly setHighlightId: (id: string | null) => void;
	readonly skipTarget: MissionStopView | null;
	readonly setSkipTarget: (stop: MissionStopView | null) => void;
	readonly removeTarget: MissionStopView | null;
	readonly setRemoveTarget: (stop: MissionStopView | null) => void;
	readonly cancelOpen: boolean;
	readonly setCancelOpen: (open: boolean) => void;
}

function useMissionSelection(): MissionSelection {
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [skipTarget, setSkipTarget] = useState<MissionStopView | null>(null);
	const [removeTarget, setRemoveTarget] = useState<MissionStopView | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);

	return {
		selectedStopId,
		setSelectedStopId,
		highlightId,
		setHighlightId,
		skipTarget,
		setSkipTarget,
		removeTarget,
		setRemoveTarget,
		cancelOpen,
		setCancelOpen,
	};
}

// --- writes -----------------------------------------------------------------

interface MissionActions {
	readonly start: () => void;
	readonly complete: () => void;
	readonly reopen: () => void;
	readonly confirmCancel: (reason: string) => void;
	readonly itemAction: (stop: MissionStopView, action: MissionItemAction) => void;
	readonly confirmSkip: (reason: string) => void;
	readonly confirmRemove: () => void;
	readonly move: (index: number, action: MoveAction) => void;
	readonly addStop: (request: RequestedControlActionRow) => void;
}

function useMissionActions({
	missionId,
	organizationId,
	actorProfileId,
	stops,
	moveStop,
	selection,
	runner,
}: {
	readonly missionId: string;
	readonly organizationId: string | null;
	readonly actorProfileId: string | null;
	readonly stops: readonly MissionStopView[];
	readonly moveStop: (index: number, action: MoveAction) => Promise<void>;
	readonly selection: MissionSelection;
	readonly runner: CommandRunner;
}): MissionActions {
	const { run } = runner;
	const { skipTarget, setSkipTarget, removeTarget, setRemoveTarget, setCancelOpen } = selection;

	const itemAction = useCallback(
		(stop: MissionStopView, action: MissionItemAction) => {
			if (action === 'skip') {
				setSkipTarget(stop);
				return;
			}
			void run(
				() => progressStop(stop.missionItemId, action, actorProfileId),
				'Unable to update that stop.',
			);
		},
		[actorProfileId, run, setSkipTarget],
	);

	const confirmSkip = useCallback(
		(reason: string) => {
			const target = skipTarget;
			setSkipTarget(null);
			if (target === null) {
				return;
			}
			void run(
				() => skipMissionItem(target.missionItemId, reason, actorProfileId),
				'Unable to skip that stop.',
			);
		},
		[skipTarget, setSkipTarget, actorProfileId, run],
	);

	const confirmRemove = useCallback(() => {
		const target = removeTarget;
		setRemoveTarget(null);
		if (target === null) {
			return;
		}
		void run(() => removeMissionItem(target.missionItemId), 'Unable to remove that stop.');
	}, [removeTarget, setRemoveTarget, run]);

	const confirmCancel = useCallback(
		(reason: string) => {
			setCancelOpen(false);
			// The command requires a reason and the dialog does not, so an empty box
			// is sent as the plain fact rather than as a validation failure.
			const trimmed = reason.trim();
			void run(
				() => cancelMission(missionId, trimmed.length === 0 ? 'Cancelled' : trimmed),
				'Unable to cancel this mission.',
			);
		},
		[missionId, setCancelOpen, run],
	);

	const addStop = useCallback(
		(request: RequestedControlActionRow) => {
			if (organizationId === null) {
				return;
			}
			void run(
				() =>
					addMissionItemFromRequest({
						missionItemId: crypto.randomUUID(),
						missionId,
						organizationId,
						actorProfileId,
						request,
						position: stops.reduce((max, stop) => Math.max(max, stop.position), -1) + 1,
					}),
				'Unable to add that stop.',
			);
		},
		[organizationId, actorProfileId, missionId, stops, run],
	);

	return {
		start: useCallback(
			() => void run(() => startMission(missionId), 'Unable to start this mission.'),
			[missionId, run],
		),
		complete: useCallback(
			() => void run(() => completeMission(missionId), 'Unable to complete this mission.'),
			[missionId, run],
		),
		reopen: useCallback(
			() => void run(() => reopenMission(missionId), 'Unable to reopen this mission.'),
			[missionId, run],
		),
		confirmCancel,
		itemAction,
		confirmSkip,
		confirmRemove,
		move: useCallback(
			(index: number, action: MoveAction) => {
				void run(() => moveStop(index, action), 'Unable to reorder the mission.');
			},
			[moveStop, run],
		),
		addStop,
	};
}

/** The three stop transitions that need no extra input. Skip collects a reason. */
function progressStop(
	missionItemId: string,
	action: Exclude<MissionItemAction, 'skip'>,
	actorProfileId: string | null,
): Promise<void> {
	if (action === 'complete') {
		return completeMissionItem(missionItemId, actorProfileId);
	}
	return action === 'unskip' ? unskipMissionItem(missionItemId) : reopenMissionItem(missionItemId);
}

// --- derived ----------------------------------------------------------------

/**
 * The map's view of the stops, numbered by the *pending* order rather than the
 * synced one, so a reorder renumbers the pins on the same frame the list
 * rearranges.
 */
function useOrderedFeatures(ordered: readonly MissionStopView[]): readonly RouteStopFeature[] {
	return useMemo(() => missionStopFeatures(ordered), [ordered]);
}

function useExistingRequestIds(stops: readonly MissionStopView[]): ReadonlySet<string> {
	return useMemo(() => {
		const ids = new Set<string>();
		for (const stop of stops) {
			if (stop.requestedControlActionId !== null) {
				ids.add(stop.requestedControlActionId);
			}
		}
		return ids;
	}, [stops]);
}
