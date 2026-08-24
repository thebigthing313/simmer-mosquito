/**
 * An agency's own geography: drawing a region, renaming it, filing it, redrawing
 * its boundary, removing it.
 *
 * ## `geometry` is an argument, not a location source
 *
 * The surveillance tables take a *location source* — a shape the user drew, or a
 * row to copy a shape from — because the record's geometry is a snapshot of
 * something else. A region is the other case, the one the address book is also
 * in: the boundary *is* the record. So the command takes the polygon itself, and
 * it rides as an argument because there is no column for it — `geom` never
 * syncs, and `geojson` is a generated read column nothing writes.
 *
 * The centroid columns are written optimistically anyway, because the map has to
 * place the region before the server answers.
 *
 * ## A save is up to three commands
 *
 * Renaming a region, moving it between folders, and redrawing it are three
 * different things to have done, and the domain has three commands for them.
 * {@link regionUpdatePlan} names the ones that actually changed. The two the
 * tree performs — an inline rename, a drag between folders — are each exactly
 * one of those three, so they are their own operations here rather than a plan
 * with one entry.
 *
 * ## The two acknowledgements, and why nothing sends them
 *
 * `updateRegionGeometry` takes `acknowledgedRegionBoundaryChange` and
 * `deleteRegion` takes `acknowledgedRegionDelete`. Both are *guarded* — the
 * domain refuses an explicit `false` — and absent still means confirmed, which
 * is what the endpoints being replaced hard-coded at their call sites.
 *
 * So omitting them is exactly today's behaviour, and that is deliberate: the
 * delete already goes through a confirmation that states its consequences, and
 * the boundary redraw has no dialog at all. Sending `true` from a form that
 * never asked would be writing the confirmation on the user's behalf, which is
 * the thing the server-side note objects to. Redrawing a boundary retroactively
 * changes which records a region contains, so it is worth asking — but adding
 * that dialog is a decision about the product, not part of moving the write.
 */

import { type GeoJsonPolygon, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { type Region, settleWrite } from '@simmer-mosquito/sync';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { regions } from '../../lib/collections/regions';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { invalidateAllRecordRegions } from '../use-record-regions';
import { optimisticStamp } from './shared';

/** A Region as its form holds one, before the boundary. */
export interface RegionFields {
	readonly name: string;
	readonly description: string | null;
	/** `null` files the region at the top level. */
	readonly folderId: string | null;
	readonly metadata: unknown;
}

type RegionUpdateIntent =
	| 'foundation.updateRegionDetails'
	| 'foundation.moveRegionToFolder'
	| 'foundation.updateRegionGeometry';

/** What an edit means, the columns it moves, and the boundary it carries. */
export interface RegionUpdatePlan {
	readonly intents: readonly RegionUpdateIntent[];
	readonly changes: Partial<Region>;
	/** Present only when the boundary was redrawn. */
	readonly arguments?: Readonly<Record<string, unknown>>;
}

/**
 * Which of the three commands an edit is, from what actually changed.
 *
 * Pure and exported for its tests. `geometry` is `null` when the boundary was
 * not touched, which is not the same as clearing it: naming the geometry command
 * with the polygon a region already has is a write with no edit behind it, and
 * the domain refuses a command with nothing to change.
 *
 * `null` when nothing moved — an untouched save is not a write.
 */
export function regionUpdatePlan(input: {
	readonly fields: RegionFields;
	readonly current: RegionFields;
	readonly geometry: GeoJsonPolygon | null;
}): RegionUpdatePlan | null {
	const { fields, current, geometry } = input;
	const intents: RegionUpdateIntent[] = [];
	const changes: Partial<Region> = {};

	if (
		fields.name !== current.name ||
		fields.description !== current.description ||
		fields.metadata !== current.metadata
	) {
		intents.push('foundation.updateRegionDetails');
		changes.name = fields.name;
		changes.description = fields.description;
		changes.metadata = fields.metadata ?? null;
	}

	// Present-and-null is how a region leaves a folder without joining another,
	// so this compares the value rather than asking whether one arrived.
	if (fields.folderId !== current.folderId) {
		intents.push('foundation.moveRegionToFolder');
		changes.region_folder_id = fields.folderId;
	}

	if (geometry !== null) {
		intents.push('foundation.updateRegionGeometry');
		const centroid = ownedCentroidFromGeoJson(geometry);
		if (centroid !== null) {
			changes.lat = centroid.lat;
			changes.lng = centroid.lng;
			changes.geom_type = centroid.geomType;
		}
	}

	if (intents.length === 0) {
		return null;
	}
	return { intents, changes, ...(geometry === null ? {} : { arguments: { geometry } }) };
}

export interface RegionMutations {
	/**
	 * Draw a new region.
	 *
	 * Hands back the write rather than awaiting it, because the import page runs
	 * six at a time and reports which confirmed, which are still syncing, and
	 * which failed — a distinction `settleWrite` collapses on purpose. The
	 * ordinary create route wraps this in `settleWrite` and forgets it.
	 */
	readonly create: (
		regionId: string,
		fields: RegionFields,
		geometry: GeoJsonPolygon,
	) => { readonly isPersisted: { readonly promise: Promise<unknown> } };
	readonly save: (input: {
		readonly regionId: string;
		readonly fields: RegionFields;
		readonly current: RegionFields;
		readonly geometry: GeoJsonPolygon | null;
	}) => Promise<void>;
	/** The tree's inline rename, which is `updateRegionDetails` and nothing else. */
	readonly rename: (regionId: string, name: string) => Promise<void>;
	/** The tree's drag between folders; `null` unfiles it. */
	readonly move: (regionId: string, folderId: string | null) => Promise<void>;
	readonly remove: (regionId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useRegionMutations(): RegionMutations {
	const auth = useAuthSnapshot();
	// Every region write clears the whole `record-regions` prefix. A redrawn
	// boundary changes which regions hold any record at all, and a rename or a
	// move changes what the band says about a record it still holds, so the five
	// writes are one case rather than two. Region writes happen in one place, so
	// the page causing the staleness is the page that clears it, precisely and
	// for one client. Chasing the other clients is what a materialized membership
	// table would be for, and ADR 0015 ruled that out.
	const queryClient = useQueryClient();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		(regionId: string, fields: RegionFields, geometry: GeoJsonPolygon) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const centroid = ownedCentroidFromGeoJson(geometry);
			if (centroid === null) {
				throw new Error('Unable to determine where the region sits.');
			}

			const now = optimisticStamp();
			const write = mutateCollection(regions, {
				operation: 'insert',
				intent: 'foundation.createRegion',
				row: {
					id: regionId,
					organization_id: organizationId,
					region_folder_id: fields.folderId,
					lat: centroid.lat,
					lng: centroid.lng,
					geom_type: centroid.geomType,
					name: fields.name,
					description: fields.description,
					metadata: fields.metadata ?? null,
					created_by_profile_id: actorProfileId,
					updated_by_profile_id: actorProfileId,
					created_at: now,
					updated_at: now,
				} satisfies Region,
				arguments: { geometry },
			});
			// This one hands the write back rather than awaiting it, so the clear
			// hangs off the persisted promise. Clearing before the server commits
			// would refetch the answer from before the region existed. A failed
			// write left nothing stale, so its rejection is nothing to act on and
			// the caller is the one reporting it.
			void write.isPersisted.promise.then(
				() => invalidateAllRecordRegions(queryClient),
				() => undefined,
			);
			return write;
		},
		[organizationId, actorProfileId, queryClient],
	);

	const save = useCallback(
		async (input: {
			readonly regionId: string;
			readonly fields: RegionFields;
			readonly current: RegionFields;
			readonly geometry: GeoJsonPolygon | null;
		}) => {
			const plan = regionUpdatePlan(input);
			if (plan === null) {
				return;
			}

			await settleWrite(
				mutateCollection(regions, {
					operation: 'update',
					intent: plan.intents,
					key: input.regionId,
					changes: {
						...plan.changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					...(plan.arguments === undefined ? {} : { arguments: plan.arguments }),
				}),
			);
			invalidateAllRecordRegions(queryClient);
		},
		[actorProfileId, queryClient],
	);

	const rename = useCallback(
		async (regionId: string, name: string) => {
			await settleWrite(
				mutateCollection(regions, {
					operation: 'update',
					intent: 'foundation.updateRegionDetails',
					key: regionId,
					changes: {
						name,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
			invalidateAllRecordRegions(queryClient);
		},
		[actorProfileId, queryClient],
	);

	const move = useCallback(
		async (regionId: string, folderId: string | null) => {
			await settleWrite(
				mutateCollection(regions, {
					operation: 'update',
					intent: 'foundation.moveRegionToFolder',
					key: regionId,
					changes: {
						region_folder_id: folderId,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
			invalidateAllRecordRegions(queryClient);
		},
		[actorProfileId, queryClient],
	);

	const remove = useCallback(
		async (regionId: string) => {
			await settleWrite(
				mutateCollection(regions, {
					operation: 'delete',
					intent: 'foundation.deleteRegion',
					key: regionId,
				}),
			);
			invalidateAllRecordRegions(queryClient);
		},
		[queryClient],
	);

	return {
		create,
		save,
		rename,
		move,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
