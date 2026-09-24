import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { sameDrawGeometry } from '../components/map/draw-parts';
import type { StopAcknowledgements } from '../lib/acknowledgements';
import { mission_items } from '../lib/collections/mission_items';
import { type DrawGeometry, toDrawGeometry } from './map/use-map-draw';
import {
	type MissionStopGeometry,
	useMissionStopGeometry,
} from './operations/use-mission-stop-geometry';
import { unmatchableId } from './queries/shared';
import { useAcknowledgedWrite } from './use-acknowledged-write';

/** `mission_items` is an on-demand shape; hold it briefly so a retry reuses the stream. */
const missionStopGcTimeMs = 30_000;

/**
 * Where the action happened, in the two forms the write needs it.
 *
 * `locationSource` is what the server resolves the geometry from, and is absent
 * exactly when the form still holds the stop's own geometry. The centroid is
 * only ever for the optimistic row, so the map and coordinates show something
 * before sync answers.
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

/**
 * Where a control action happened, from the geometry on the form. A geometry is
 * required on a mission stop as it is off one, and a geometry still exactly the
 * stop's is sent as none, for the server to copy the stop's stored shape.
 */
export function resolveActionLocation(input: {
	readonly geometry: unknown;
	readonly stopGeometry: DrawGeometry | null;
	readonly messages: LocationMessages;
}): ResolvedActionLocation {
	if (input.geometry === null || input.geometry === undefined) {
		throw new Error(input.messages.missing);
	}
	// The four create pages hand this straight off their form state, so it
	// arrives untyped. `toDrawGeometry` is the check; casting here would hand the
	// centroid reader a shape nothing had looked at.
	const drawn = toDrawGeometry(input.geometry);
	if (drawn === null) {
		throw new Error(input.messages.unresolvable);
	}
	const location = drawnLocation(drawn, input.messages);
	return sameDrawGeometry(drawn, input.stopGeometry)
		? { ...location, locationSource: undefined }
		: location;
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
	/** The stop's geometry for the form to draw, or null off a stop. */
	readonly missionStop: MissionStopGeometry | null;
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

/**
 * The mission half of a control action create page: the stop read out of
 * `search`, the stop's geometry for the form to draw, the acknowledged write,
 * and the return to the mission rather than to the new record.
 */
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

	// Nothing reads this row. Subscribing warms the on-demand stream this page is
	// about to write against, which is what keeps the write's txid confirmation
	// from timing out.
	useLiveQuery({
		gcTime: missionStopGcTimeMs,
		query: (query) =>
			query
				.from({ item: mission_items() })
				.where(({ item }) => eq(item.id, missionItemId ?? unmatchableId))
				.select(({ item }) => ({ id: item.id })),
	});

	const missionStop = useMissionStopGeometry({ missionId, missionItemId });

	const resolveLocation = (geometry: unknown, messages: LocationMessages): ResolvedActionLocation =>
		resolveActionLocation({
			geometry,
			messages,
			stopGeometry: missionStop?.status === 'ready' ? missionStop.geometry : null,
		});

	const navigateAfterSave = async (toRecord: () => Promise<void>) => {
		// Back to the worklist the stop came from; the crew's next move is the next
		// stop, not this record.
		if (missionId !== null) {
			await navigate({ params: { id: missionId }, to: '/operations/missions/$id' });
			return;
		}
		await toRecord();
	};

	return {
		dialog,
		missionItemId,
		navigateAfterSave,
		resolveLocation,
		run,
		missionStop,
	};
}
