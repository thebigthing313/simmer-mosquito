/**
 * The stations an agency reads weather at: adding one, renaming it, moving it,
 * retiring it, deleting it.
 *
 * ## `geometry` is an argument, not a location source
 *
 * Same case as a Region and an Address: the point *is* the record, not a snapshot
 * of somewhere else, so the command takes the geometry itself. It rides as an
 * argument because there is no column for it, `geom` never syncs, and the
 * `lat`/`lng`/`geom_type` the collection carries are generated read columns.
 * They are written optimistically anyway, because the stations map has to place
 * the pin before the server answers.
 *
 * ## A save is up to two commands
 *
 * Renaming a station and moving it are separate things to have done, and the
 * domain has separate commands for them, because they need separate
 * confirmations: renaming rewrites what every past summary is labelled, and
 * moving rewrites where every past summary was taken. {@link stationUpdatePlan}
 * names the ones that actually changed.
 *
 * ## The acknowledgements are asked for, not assumed
 *
 * Unlike the region writes, these are sent explicitly, because the server only
 * demands them when the station already has summaries and it says so by name
 * when it refuses. A form that sent `true` unconditionally would be writing the
 * user's confirmation for them; a form that never sent one could not save a
 * station that has readings at all. So the caller passes what the user answered,
 * and an untouched form passes `false` and finds out whether it mattered.
 */

import { type GeoJsonPoint, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { settleWrite, type WeatherSource } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { weather_sources } from '../../lib/collections/weather_sources';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { optimisticStamp } from './shared';

/** A weather station as its form holds one, before the point. */
export interface WeatherStationFields {
	readonly name: string;
	readonly code: string | null;
	/** Organization-specific notes. Not part of the station's identity. */
	readonly metadata: unknown;
}

type StationUpdateIntent =
	| 'weather.updateWeatherStationDetails'
	| 'weather.updateWeatherStationLocation';

/**
 * What an edit means, the columns it moves, the point it carries, and the
 * confirmations it answers.
 *
 * `arguments` and `acknowledgements` are kept apart because the transport treats
 * them differently: an argument is folded in before the "did anything change"
 * check, so a redrawn point counts as an edit, while an acknowledgement is not,
 * so answering a refusal cannot on its own turn an untouched form into a write.
 */
export interface StationUpdatePlan {
	readonly intents: readonly StationUpdateIntent[];
	readonly changes: Partial<WeatherSource>;
	readonly arguments: Readonly<Record<string, unknown>>;
	readonly acknowledgements: Readonly<Record<string, boolean>>;
}

/**
 * Which of the two commands an edit is, from what actually changed.
 *
 * Pure and exported for its tests. `geometry` is `null` when the pin was not
 * moved, which is not the same as clearing it: naming the location command with
 * the point a station already has is a write with no edit behind it, and the
 * domain refuses a command with nothing to change.
 *
 * `null` when nothing moved, an untouched save is not a write.
 */
export function stationUpdatePlan(input: {
	readonly fields: WeatherStationFields;
	readonly current: WeatherStationFields;
	readonly geometry: GeoJsonPoint | null;
	readonly acknowledgedIdentityChange: boolean;
	readonly acknowledgedLocationChange: boolean;
}): StationUpdatePlan | null {
	const { fields, current, geometry } = input;
	const intents: StationUpdateIntent[] = [];
	const changes: Partial<WeatherSource> = {};
	const args: Record<string, unknown> = {};
	const acknowledgements: Record<string, boolean> = {};

	const changesIdentity = fields.name !== current.name || fields.code !== current.code;
	if (changesIdentity || fields.metadata !== current.metadata) {
		intents.push('weather.updateWeatherStationDetails');
		changes.source_name = fields.name;
		changes.source_code = fields.code;
		changes.metadata = fields.metadata ?? null;
		// Only an identity change can be refused over the station's history, so a
		// notes-only edit does not answer a question nobody asked. The server draws
		// the same line.
		if (changesIdentity) {
			acknowledgements.acknowledgedHistoricalStationIdentityChange =
				input.acknowledgedIdentityChange;
		}
	}

	if (geometry !== null) {
		intents.push('weather.updateWeatherStationLocation');
		const centroid = ownedCentroidFromGeoJson(geometry);
		if (centroid !== null) {
			changes.lat = centroid.lat;
			changes.lng = centroid.lng;
			changes.geom_type = centroid.geomType;
		}
		args.geometry = geometry;
		acknowledgements.acknowledgedHistoricalLocationChange = input.acknowledgedLocationChange;
	}

	if (intents.length === 0) {
		return null;
	}
	return { intents, changes, arguments: args, acknowledgements };
}

export interface WeatherStationMutations {
	readonly create: (
		weatherStationId: string,
		fields: WeatherStationFields,
		geometry: GeoJsonPoint,
	) => Promise<void>;
	readonly save: (input: {
		readonly weatherStationId: string;
		readonly fields: WeatherStationFields;
		readonly current: WeatherStationFields;
		readonly geometry: GeoJsonPoint | null;
		readonly acknowledgedIdentityChange: boolean;
		readonly acknowledgedLocationChange: boolean;
	}) => Promise<void>;
	/** Retire a station, or bring it back. Both are idempotent. */
	readonly setActive: (weatherStationId: string, isActive: boolean) => Promise<void>;
	/**
	 * Delete a station and every summary recorded against it.
	 *
	 * `acknowledgedSummaryDeletion` is the caller's, because this is the one
	 * weather write that destroys data and the dialog that asks is what earns it.
	 */
	readonly remove: (
		weatherStationId: string,
		acknowledgedSummaryDeletion: boolean,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useWeatherStationMutations(): WeatherStationMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (weatherStationId: string, fields: WeatherStationFields, geometry: GeoJsonPoint) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const centroid = ownedCentroidFromGeoJson(geometry);
			if (centroid === null) {
				throw new Error('Unable to determine where the station sits.');
			}
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(weather_sources(), {
					operation: 'insert',
					intent: 'weather.createWeatherStation',
					row: {
						id: weatherStationId,
						organization_id: organizationId,
						lat: centroid.lat,
						lng: centroid.lng,
						geom_type: centroid.geomType,
						// An agency's own station is always its own source. The `nws` type
						// is plumbing for a provider feed no command writes, so the server
						// sets this rather than reading it, and the optimistic row says
						// what the server will.
						source_type: 'organization',
						source_name: fields.name,
						source_code: fields.code,
						metadata: fields.metadata ?? null,
						provider_source_id: null,
						is_active: true,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies WeatherSource,
					arguments: { geometry, metadata: fields.metadata ?? null },
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (input: {
			readonly weatherStationId: string;
			readonly fields: WeatherStationFields;
			readonly current: WeatherStationFields;
			readonly geometry: GeoJsonPoint | null;
			readonly acknowledgedIdentityChange: boolean;
			readonly acknowledgedLocationChange: boolean;
		}) => {
			const plan = stationUpdatePlan(input);
			if (plan === null) {
				return;
			}
			await settleWrite(
				mutateCollection(weather_sources(), {
					operation: 'update',
					intent: plan.intents,
					key: input.weatherStationId,
					changes: {
						...plan.changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					arguments: plan.arguments,
					acknowledgements: plan.acknowledgements,
				}),
			);
		},
		[actorProfileId],
	);

	const setActive = useCallback(
		async (weatherStationId: string, isActive: boolean) => {
			await settleWrite(
				mutateCollection(weather_sources(), {
					operation: 'update',
					// `is_active` is a column the client can see, so which direction a
					// write means has to be said rather than read off the value.
					intent: isActive
						? 'weather.reactivateWeatherStation'
						: 'weather.deactivateWeatherStation',
					key: weatherStationId,
					changes: {
						is_active: isActive,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (weatherStationId: string, acknowledgedSummaryDeletion: boolean) => {
			await settleWrite(
				mutateCollection(weather_sources(), {
					operation: 'delete',
					intent: 'weather.deleteWeatherStation',
					key: weatherStationId,
					// A delete carries no row and no changed fields, so an acknowledgement
					// is the only thing it can say beyond the command's name.
					acknowledgements: { acknowledgedSummaryDeletion },
				}),
			);
		},
		[],
	);

	return {
		create,
		save,
		setActive,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
