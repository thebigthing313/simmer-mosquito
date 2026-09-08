/**
 * The crew who worked a record alongside the person it is attributed to.
 *
 * One polymorphic table backs every kind of field work, so this one hook serves
 * six record types. `entity_type` is the discriminator and the column holds it in
 * snake_case, which is what the server writes and what Electric streams back —
 * see `toDbEntityType`.
 *
 * The old read matched the snake_case value *and* the camelCase one, because the
 * optimistic row it wrote used the domain's spelling and only the synced row used
 * the column's. The write now stamps the column's spelling on the optimistic row
 * too, so there is one value to match and a row no longer changes shape under the
 * query when the server confirms it.
 *
 * Mount it wherever personnel are written, not only where they are read: the
 * subscription is what keeps this on-demand collection's live stream warm, and a
 * write over a cold stream never sees its txid come back.
 */

import { type AdditionalPersonnelTargetType, toDbEntityType } from '@simmer-mosquito/domain';
import { and, eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { additional_personnel } from '../../lib/collections/additional_personnel';

/** The record the crew is attached to. */
export interface AdditionalPersonnelTarget {
	readonly type: AdditionalPersonnelTargetType;
	readonly id: string;
}

// Keep an entity's subset warm briefly after unmount so reopening a form reuses
// it rather than re-requesting.
const additionalPersonnelGcTimeMs = 30_000;

/** One crew row, as much of it as attaching and detaching needs. */
export interface AdditionalPersonnelLink {
	readonly id: string;
	readonly personnelProfileId: string;
}

export interface AdditionalPersonnelResult {
	/** The rows currently attached, oldest first. */
	readonly rows: readonly AdditionalPersonnelLink[];
	/** Their profile ids, deduplicated — the form's field value. */
	readonly profileIds: readonly string[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

export function useAdditionalPersonnel(
	target: AdditionalPersonnelTarget,
): AdditionalPersonnelResult {
	const entityType = toDbEntityType(target.type);

	const result = useLiveQuery(
		{
			gcTime: additionalPersonnelGcTimeMs,
			query: (query) =>
				query
					.from({ personnel: additional_personnel() })
					.where(({ personnel }) =>
						and(eq(personnel.entity_type, entityType), eq(personnel.entity_id, target.id)),
					)
					.orderBy(({ personnel }) => personnel.created_at, 'asc')
					.select(({ personnel }) => ({
						id: personnel.id,
						personnelProfileId: personnel.personnel_profile_id,
					})),
		},
		[entityType, target.id],
	);

	const rows = result.data;

	// Memoized rather than mapped inline: `rows` is the observer's cached
	// snapshot, so this hands back the same array until the crew actually changes.
	const profileIds = useMemo(() => [...new Set(rows.map((row) => row.personnelProfileId))], [rows]);

	return { rows, profileIds, isReady: result.isReady, isError: result.isError };
}
