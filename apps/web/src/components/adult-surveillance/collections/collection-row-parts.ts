/**
 * What a collection row reads on the Collections Map's rail and in the
 * Collections Table: its name, the colour its status paints, and who handled
 * it. Each takes a `CollectionListRow`, one row of `/map/collections`.
 */

import { collectionLabel } from '../../../hooks/queries/trap-view';
import { COLLECTION_STATUS_COLORS } from '../../map';
import { type CollectionStatusValue, collectionStatusLabel } from './legend';

/** One collection as `/map/collections` answers it, cut to what the two surfaces draw. */
export interface CollectionListRow {
	readonly id: string;
	readonly trapId: string | null;
	/** The Address it was linked to: the rung below the trap name. */
	readonly addressDisplayName: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly collectionMethodId: string;
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	/** Resolved server-side by precedence, and what the map paints this by. */
	readonly status: CollectionStatusValue;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
}

/**
 * What a collection is called: its trap's name, else the address, the
 * coordinates, then the word (#1231).
 *
 * The caller resolves the trap's name from the trap name map and substitutes
 * `Unknown trap` for a trap it cannot name, so a row with a trap never reaches
 * the ladder below with a null name. That is why `trapId: null` goes in below:
 * it says the trap rung is taken rather than describing the row. The server
 * row carries no trap name columns of its own.
 */
export function collectionRowLabel(
	row: CollectionListRow,
	trapNameById: ReadonlyMap<string, string>,
): string {
	if (row.trapId !== null) {
		return trapNameById.get(row.trapId) ?? 'Unknown trap';
	}
	return collectionLabel(
		{ trapId: null, trapName: null, trapCode: null, lat: row.lat, lng: row.lng },
		{ addressName: row.addressDisplayName, fallback: 'One-off collection' },
	);
}

/** The status colour this collection draws in, so the row matches the map. */
export function collectionSwatch(status: CollectionStatusValue): {
	readonly color: string;
	readonly label: string;
} {
	return {
		color: COLLECTION_STATUS_COLORS[status] ?? COLLECTION_STATUS_COLORS.collected ?? '',
		label: collectionStatusLabel(status),
	};
}

/** Who handled this collection: whoever collected it, else whoever set it. */
export function collectionPersonnelName(
	row: CollectionListRow,
	nameById: ReadonlyMap<string, string>,
): string | null {
	const profileId = row.collectedByProfileId ?? row.setByProfileId;
	return profileId === null ? null : (nameById.get(profileId) ?? null);
}
