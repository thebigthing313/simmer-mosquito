import { useCallback, useMemo, useState } from 'react';
import { useControlMethodNames, usePersonnelOptions } from '../../../components/explorer';
import type { RouteStopFeature } from '../../../components/map';
import { type MoveAction, type MovePlan, useStopOrder } from '../../../components/stop-order';
import {
	type MissionItemMutations,
	useMissionItemMutations,
} from '../../../hooks/mutations/use-mission-item-mutations';
import { useMissionMutations } from '../../../hooks/mutations/use-mission-mutations';
import type {
	MissionProgressCounts,
	MissionStatus,
	OpenRequest,
} from '../../../hooks/queries/operations-view';
import { missionDisplayName } from '../../../hooks/queries/operations-view';
import { type MissionRecord, useMission } from '../../../hooks/queries/use-mission';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useHasRole } from '../../../hooks/use-can-write';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { type CommandRunner, useCommandRunner } from '../-command-runner';
import {
	canCompleteMission,
	canEditMissionPlan,
	canProgressMissionItems,
	canRecordMissionStopWork,
	canStartMission,
	type MissionItemAction,
	type MissionStopView,
	useMissionStopViews,
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
	readonly error: string | null;

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
	const commitMove = useCallback(
		(plan: MovePlan) => missionWrites.moveStops(missionId, plan),
		[missionWrites, missionId],
	);
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

	const features = useOrderedFeatures(ordered);
	const existingRequestIds = useExistingRequestIds(stops);

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
function useMissionLabels(mission: MissionRecord | null): MissionLabels {
	const { nameById } = usePersonnelOptions();
	const methodNameById = useControlMethodNames();
	const timeZone = useOrganizationTimeZone();

	return {
		displayName: mission === null ? null : missionDisplayName(mission, timeZone),
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
	readonly reopenOpen: boolean;
	readonly setReopenOpen: (open: boolean) => void;
}

function useMissionSelection(): MissionSelection {
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);
	const [skipTarget, setSkipTarget] = useState<MissionStopView | null>(null);
	const [removeTarget, setRemoveTarget] = useState<MissionStopView | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [reopenOpen, setReopenOpen] = useState(false);

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
		reopenOpen,
		setReopenOpen,
	};
}

// --- writes -----------------------------------------------------------------

interface MissionActions {
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

function useMissionActions({
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

	const itemAction = useCallback(
		(stop: MissionStopView, action: MissionItemAction) => {
			if (action === 'skip') {
				setSkipTarget(stop);
				return;
			}
			void run(
				() => progressStop(stopWrites, stop.missionItemId, action),
				'Unable to update that stop.',
			);
		},
		[stopWrites, run, setSkipTarget],
	);

	const confirmSkip = useCallback(
		(reason: string) => {
			const target = skipTarget;
			setSkipTarget(null);
			if (target === null) {
				return;
			}
			void run(() => stopWrites.skip(target.missionItemId, reason), 'Unable to skip that stop.');
		},
		[skipTarget, setSkipTarget, stopWrites, run],
	);

	const confirmRemove = useCallback(() => {
		const target = removeTarget;
		setRemoveTarget(null);
		if (target === null) {
			return;
		}
		void run(() => stopWrites.removeStop(target.missionItemId), 'Unable to remove that stop.');
	}, [removeTarget, setRemoveTarget, stopWrites, run]);

	const confirmCancel = useCallback(
		(reason: string) => {
			setCancelOpen(false);
			// The command requires a reason and the dialog does not, so an empty box
			// is sent as the plain fact rather than as a validation failure.
			const trimmed = reason.trim();
			void run(
				() => missionWrites.cancel(missionId, trimmed.length === 0 ? 'Cancelled' : trimmed),
				'Unable to cancel this mission.',
			);
		},
		[missionId, setCancelOpen, missionWrites, run],
	);

	const confirmReopen = useCallback(
		(reason: string) => {
			setReopenOpen(false);
			// Same bargain as cancelling: the command requires text and the dialog does
			// not, so an empty box becomes the plain fact rather than a refused reopen.
			const trimmed = reason.trim();
			void run(
				() => missionWrites.reopen(missionId, trimmed.length === 0 ? 'Reopened' : trimmed),
				'Unable to reopen this mission.',
			);
		},
		[missionId, setReopenOpen, missionWrites, run],
	);

	const addStop = useCallback(
		(request: OpenRequest) => {
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
		},
		[organizationId, stopWrites, missionId, stops, run],
	);

	return {
		start: useCallback(
			() => void run(() => missionWrites.start(missionId), 'Unable to start this mission.'),
			[missionId, missionWrites, run],
		),
		complete: useCallback(
			() => void run(() => missionWrites.complete(missionId), 'Unable to complete this mission.'),
			[missionId, missionWrites, run],
		),
		reopen: useCallback(() => setReopenOpen(true), [setReopenOpen]),
		confirmCancel,
		confirmReopen,
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
	writes: MissionItemMutations,
	missionItemId: string,
	action: Exclude<MissionItemAction, 'skip'>,
): Promise<void> {
	if (action === 'complete') {
		return writes.complete(missionItemId);
	}
	return action === 'unskip' ? writes.unskip(missionItemId) : writes.reopen(missionItemId);
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
