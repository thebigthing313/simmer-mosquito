import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { MissionItemRow } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useCallback } from 'react';
import type { StopAcknowledgements } from '../lib/stop-acknowledgements';
import { webCollections } from '../sync/webCollections';
import { useAcknowledgedWrite } from './acknowledged-write';

/**
 * Recording a control action off a mission stop, from the create page's side.
 *
 * The four control-action create pages differ only in what they record; every
 * mission concern is identical across them — reading the stop out of search,
 * relaxing the location requirement, answering an acknowledgeable refusal, and
 * returning to the mission rather than the new record. Held here once so a
 * change to how a stop is executed is one edit rather than four, and so the
 * three commands that ship without a wire-body test cannot drift from the one
 * that has one.
 */

/** A syntactically valid uuid no row matches — keeps a subset predicate live and empty. */
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/** `mission_items` is an on-demand shape; hold it briefly so a retry reuses the stream. */
const missionStopGcTimeMs = 30_000;

/**
 * Where the action happened, in the two forms the write needs it.
 *
 * `locationSource` is what the server resolves the geometry from, and is absent
 * exactly when the stop's own geometry is to be used. The centroid is only ever
 * for the optimistic row, so the map and coordinates show something before sync
 * answers.
 */
export interface ResolvedActionLocation {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
	readonly locationSource:
		| { readonly kind: 'geometry'; readonly geometry: GeoJsonGeometry }
		| undefined;
}

/** What to say when the crew has to place the point, and when its shape is unreadable. */
export interface LocationMessages {
	readonly missing: string;
	readonly unresolvable: string;
}

/** The stop's own centroid, all this needs of a `MissionItemRow`. */
type StopCentroid = Pick<MissionItemRow, 'lat' | 'lng' | 'geomType'>;

/**
 * Where a control action happened, from what the form has and what the stop
 * names.
 *
 * Pure and exported so the rule can be tested without rendering: this is the
 * seam where the four create pages used to throw "place the point" on a mission
 * stop whose form had not marked the point required, which made the server's
 * geometry default unreachable from the UI.
 */
export function resolveActionLocation(input: {
	readonly geometry: unknown;
	readonly missionItemId: string | null;
	readonly stop: StopCentroid | null;
	readonly messages: LocationMessages;
}): ResolvedActionLocation {
	if (input.geometry !== null && input.geometry !== undefined) {
		return drawnLocation(input.geometry as GeoJsonGeometry, input.messages);
	}
	// Off a mission the point is the only thing that says where the work
	// happened, so its absence is the crew's to fix.
	if (input.missionItemId === null) {
		throw new Error(input.messages.missing);
	}
	// On one, the stop already names the ground and the server defaults the
	// action's geometry from it — no location source is sent at all. The
	// optimistic row still needs a centroid, and the stop's is the one the server
	// is about to give it.
	if (input.stop === null) {
		throw new Error('The mission stop is still loading.');
	}
	return {
		geomType: input.stop.geomType,
		lat: input.stop.lat,
		lng: input.stop.lng,
		locationSource: undefined,
	};
}

function drawnLocation(geometry: GeoJsonGeometry, messages: LocationMessages) {
	const centroid = ownedCentroidFromGeoJson(geometry);
	if (centroid === null) {
		throw new Error(messages.unresolvable);
	}
	return {
		geomType: centroid.geomType,
		lat: centroid.lat,
		lng: centroid.lng,
		locationSource: { geometry, kind: 'geometry' } as const,
	};
}

export interface MissionStopExecution {
	/** The stop being executed, or null for an ordinary off-mission record. */
	readonly missionItemId: string | null;
	/** Whether the form must have a drawn location before it will submit. */
	readonly requireLocation: boolean;
	/** Run the save; `acknowledgements` is empty on the first attempt. */
	readonly run: (write: (acknowledgements: StopAcknowledgements) => Promise<void>) => Promise<void>;
	/** Render inside the page. Null until a write is refused with a question. */
	readonly dialog: ReactNode;
	readonly resolveLocation: (
		geometry: unknown,
		messages: LocationMessages,
	) => ResolvedActionLocation;
	/** Back to the mission the stop belongs to, else wherever the page would go. */
	readonly navigateAfterSave: (toRecord: () => Promise<void>) => Promise<void>;
}

export function useMissionStopExecution(search: {
	readonly missionItemId?: string | undefined;
	readonly missionId?: string | undefined;
}): MissionStopExecution {
	const missionItemId = search.missionItemId ?? null;
	const missionId = search.missionId ?? null;
	const navigate = useNavigate();

	// The whole save is what a confirmed acknowledgement re-runs, crew rows
	// included; every id is minted up front, so a retry writes the same rows.
	const { run, dialog } = useAcknowledgedWrite();

	// The stop's own centroid, for the optimistic row when nothing was drawn.
	// Subscribing also warms the on-demand stream this page is about to write
	// against, which is what keeps the write's txid confirmation from timing out.
	const stopResult = useLiveQuery(
		{
			gcTime: missionStopGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.missionItems })
					.where(({ item }) => eq(item.id, missionItemId ?? UNMATCHABLE_ID)),
		},
		[missionItemId],
	);
	const stop = ((stopResult.data ?? []) as readonly MissionItemRow[])[0] ?? null;

	const resolveLocation = useCallback(
		(geometry: unknown, messages: LocationMessages): ResolvedActionLocation =>
			resolveActionLocation({ geometry, messages, missionItemId, stop }),
		[missionItemId, stop],
	);

	const navigateAfterSave = useCallback(
		async (toRecord: () => Promise<void>) => {
			// Back to the worklist the stop came from; the crew's next move is the
			// next stop, not this record.
			if (missionId !== null) {
				await navigate({ params: { id: missionId }, to: '/operations/missions/$id' });
				return;
			}
			await toRecord();
		},
		[missionId, navigate],
	);

	return {
		dialog,
		missionItemId,
		navigateAfterSave,
		// A mission stop already names the ground. The server defaults the action's
		// geometry from it, so requiring a draw here would make the crew re-trace
		// the place they were sent — and, for a line or polygon stop, trace it
		// wrongly enough to trip the coverage check.
		requireLocation: missionItemId === null,
		resolveLocation,
		run,
	};
}
