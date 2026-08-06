import { type AdditionalPersonnelTargetType, toDbEntityType } from '@simmer-mosquito/domain';
import type { AdditionalPersonnelRow, ProfileRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import type { MultiSelectOption } from '@simmer-mosquito/ui-web/components/multi-select';
import { and, eq, or, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { lifecycleOptions } from '../lib/lifecycle-options';
import { reconcileLinks } from '../sync/reconcile-links';
import { webCollections } from '../sync/webCollections';

/**
 * Additional personnel — the crew who worked a record alongside the person it is
 * attributed to. One polymorphic table backs every kind of field work, so this
 * module is the single read/write seam every form uses.
 */

/** The record the crew is attached to. */
export interface AdditionalPersonnelTarget {
	readonly type: AdditionalPersonnelTargetType;
	readonly id: string;
}

// additional_personnel is on-demand (docs/sync.md); keep an entity's subset warm
// briefly after unmount so reopening a form reuses it.
const additionalPersonnelGcTimeMs = 30_000;

export interface AdditionalPersonnelResult {
	/** The rows currently attached, oldest first. */
	readonly rows: readonly AdditionalPersonnelRow[];
	/** Their profile ids, deduplicated — the form's field value. */
	readonly profileIds: readonly string[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

/**
 * Load the crew attached to one record.
 *
 * Mount this wherever personnel are written, not only where they are read: the
 * subscription is what keeps the on-demand live stream warm, and a write over a
 * cold stream never sees its txid come back.
 */
export function useAdditionalPersonnel(
	target: AdditionalPersonnelTarget,
): AdditionalPersonnelResult {
	const result = useLiveQuery(
		{
			gcTime: additionalPersonnelGcTimeMs,
			query: (query) =>
				query
					.from({ personnel: webCollections.additionalPersonnel })
					// The DB stores entity_type in snake_case; match that (persisted rows)
					// and the camelCase target (a just-written optimistic row) so a fresh
					// attachment shows immediately. See toDbEntityType.
					.where(({ personnel }) =>
						and(
							or(
								eq(personnel.entityType, target.type),
								eq(personnel.entityType, toDbEntityType(target.type)),
							),
							eq(personnel.entityId, target.id),
						),
					)
					.orderBy(({ personnel }) => personnel.createdAt, 'asc'),
		},
		[target.type, target.id],
	);

	const rows = (result.data ?? []) as unknown as readonly AdditionalPersonnelRow[];
	const profileIds = useMemo(() => [...new Set(rows.map((row) => row.personnelProfileId))], [rows]);

	return { rows, profileIds, isReady: result.isReady, isError: result.isError };
}

/**
 * Options for the personnel picker: everyone on the roster, current staff first,
 * so a crew from three seasons ago can still be recorded. Only the person the
 * record is already attributed to drops out, and even they stay if they are
 * somehow attached as crew too.
 */
export function additionalPersonnelOptions(
	profiles: readonly ProfileRow[],
	selectedIds: readonly string[],
	options: { readonly excludeProfileId?: string | null } = {},
): readonly MultiSelectOption[] {
	const selected = new Set(selectedIds);
	const excluded = options.excludeProfileId ?? null;
	return lifecycleOptions(
		profiles.filter((profile) => profile.id !== excluded || selected.has(profile.id)),
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);
}

/**
 * Reconcile a record's crew with what the form holds — add whoever is new,
 * detach whoever was dropped, leave the rest alone.
 *
 * Call it after the parent record itself has settled: on create the row must
 * exist before anything can reference it.
 */
export async function saveAdditionalPersonnel(input: {
	readonly target: AdditionalPersonnelTarget;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	/** What is attached now — empty when the record was just created. */
	readonly existing: readonly AdditionalPersonnelRow[];
	/** Who the form says should be attached. */
	readonly profileIds: readonly string[];
}): Promise<void> {
	const { removals, additions } = reconcileLinks(
		input.existing,
		(row) => row.personnelProfileId,
		input.profileIds,
	);

	if (removals.length === 0 && additions.length === 0) {
		return;
	}

	const now = new Date().toISOString();
	await Promise.all([
		...removals.map((row) => settleWrite(webCollections.additionalPersonnel.delete(row.id))),
		...additions.map((personnelProfileId) =>
			settleWrite(
				webCollections.additionalPersonnel.insert({
					id: crypto.randomUUID(),
					organizationId: input.organizationId,
					personnelProfileId,
					entityType: input.target.type,
					entityId: input.target.id,
					createdByProfileId: input.actorProfileId,
					updatedByProfileId: input.actorProfileId,
					createdAt: now,
					updatedAt: now,
				} satisfies AdditionalPersonnelRow),
			),
		),
	]);
}
