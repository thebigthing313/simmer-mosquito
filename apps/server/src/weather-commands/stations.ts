/**
 * The six station commands, against `weather_sources`.
 *
 * A weather station is a named point an agency reads weather at. The rows are
 * small, the writes are rare, and almost all of the work here is the four checks
 * the domain cannot make because they turn on what is stored: does the agency
 * own this station, has it changed since the client loaded it, does it already
 * hold summaries, and does the name collide with another of the agency's.
 *
 * ## What the acknowledgements are for
 *
 * Summaries do not snapshot the station's name, code, or location, the schema
 * has no per-summary snapshot columns and `docs/weather-domain.md` says none is
 * coming in v1. So a station's identity and position are retroactive: renaming a
 * station renames it in every report of every summary ever recorded against it,
 * and moving one moves all of that history to the new point. The domain carries
 * `acknowledgedHistoricalStationIdentityChange` and
 * `acknowledgedHistoricalLocationChange` for exactly that, and they only bite
 * when summaries exist, because with none there is no history to rewrite.
 *
 * ## Deleting is a cleanup action
 *
 * It hard-deletes the station's summaries and then soft-deletes the station, so
 * it is the one weather write that destroys data. `acknowledgedSummaryDeletion`
 * gates it, again only when there are summaries to lose.
 *
 * There is no `applyRecordDeletion` call, and no `weatherStation` entry in
 * `DeletableRecordType`. That registry exists to refuse a delete that would
 * orphan rows pointing at the record, and the only rows that can point at a
 * station are its summaries, which are not orphaned but deliberately removed.
 * Stations are not commentable, taggable, or personnel targets either.
 *
 * `weather_source_subscriptions.weather_source_id` is the exception on paper: it
 * is an `on delete restrict` foreign key, so a subscription would block the hard
 * delete of a station. Nothing writes that table in v1 and
 * `docs/weather-domain.md` lists subscriptions among the exclusions, so no such
 * row can exist. If one ever can, this delete needs the registry rather than a
 * comment.
 */

import {
	assertClearanceAcknowledged,
	assertHistoryAcknowledged,
	geojsonToGeom,
	sql,
} from '@simmer-mosquito/db';
import type { WeatherCommand } from '@simmer-mosquito/domain';
import { stationSummaryRule } from '../record-history.js';
import { refusableWrite } from '../table-commands/shared.js';
import {
	assertFresh,
	loadStation,
	type StationState,
	type WeatherStationRow,
	type WeatherTransaction,
	weatherStationReturnColumns,
} from './shared.js';

/**
 * The 409 a colliding name or code becomes.
 *
 * Both are unique per organization after trim and case-fold, enforced by the two
 * partial indexes `202605130001_weather_domain_updates.sql` adds. Uniqueness is a
 * context-dependent rule, so the domain cannot check it and the database is the
 * only thing that knows, which means the answer only exists once the statement
 * has run, and `refusableWrite` is what turns it into words rather than a 500.
 */
const DUPLICATE_STATION = {
	error: 'weather_station_duplicate',
	reason: 'Another weather station already uses this name or code.',
};

/**
 * The six station commands, dispatched.
 *
 * Each arm is its own function rather than a block inside the `switch`, because
 * every one of them does the same four-step dance, resolve the row, check
 * staleness, check an acknowledgement, write, and reading them side by side is
 * how you see which steps a given command skips and why.
 */
export async function writeWeatherStationCommand(
	trx: WeatherTransaction,
	command: WeatherCommand,
): Promise<WeatherStationRow | null> {
	switch (command.type) {
		case 'weather.createWeatherStation':
			return createStation(trx, command.payload);
		case 'weather.updateWeatherStationDetails':
			return updateStationDetails(trx, command.payload);
		case 'weather.updateWeatherStationLocation':
			return moveStation(trx, command.payload);
		// Both lifecycle writes are idempotent by the domain's rule, and they are
		// idempotent here for free: setting `is_active` to what it already holds
		// still returns the row, so a repeat answers 200 with the same station.
		case 'weather.deactivateWeatherStation':
			return setStationActive(trx, command.payload, false);
		case 'weather.reactivateWeatherStation':
			return setStationActive(trx, command.payload, true);
		case 'weather.deleteWeatherStation':
			return deleteStation(trx, command.payload);
		default:
			throw new Error(`Unsupported weather station command: ${command.type}`);
	}
}

type CreatePayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.createWeatherStation' }
>['payload'];
type DetailsPayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.updateWeatherStationDetails' }
>['payload'];
type LocationPayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.updateWeatherStationLocation' }
>['payload'];
type LifecyclePayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.deactivateWeatherStation' }
>['payload'];
type DeletePayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.deleteWeatherStation' }
>['payload'];

async function createStation(
	trx: WeatherTransaction,
	payload: CreatePayload,
): Promise<WeatherStationRow> {
	const row = await refusableWrite(
		() =>
			trx
				.insertInto('weather_sources')
				.values({
					id: payload.weatherStationId,
					organization_id: payload.organizationId,
					geom: geojsonToGeom(payload.geometry),
					// v1 agency stations are always their own source. The `nws` type and
					// `provider_source_id` are plumbing no command writes.
					source_type: 'organization',
					source_name: payload.stationName,
					source_code: payload.stationCode,
					provider_source_id: null,
					metadata: payload.metadata,
					created_by_profile_id: payload.actorProfileId,
					updated_by_profile_id: payload.actorProfileId,
				})
				.returning(weatherStationReturnColumns)
				.executeTakeFirstOrThrow(),
		{ duplicate: DUPLICATE_STATION },
	);
	return row;
}

async function updateStationDetails(
	trx: WeatherTransaction,
	payload: DetailsPayload,
): Promise<WeatherStationRow | null> {
	const station = await requireStation(trx, payload);
	if (station === null) {
		return null;
	}
	// Metadata is not part of the station's identity, so a metadata-only edit asks
	// nothing of the user. Reading which keys the command carries, rather than
	// whether any change arrived, is what keeps that true.
	const changesIdentity =
		payload.changes.stationName !== undefined || payload.changes.stationCode !== undefined;
	await assertHistoryAcknowledged(trx, {
		acknowledgement: 'acknowledgedHistoricalStationIdentityChange',
		acknowledged: changesIdentity ? payload.acknowledgedHistoricalStationIdentityChange : true,
		subject: 'station',
		rules: [stationSummaryRule(station.id)],
		message:
			'This station already has summaries. Renaming it renames it in every report of those summaries.',
	});
	return updateStation(
		trx,
		station.id,
		payload.organizationId,
		{
			...(payload.changes.stationName !== undefined
				? { source_name: payload.changes.stationName }
				: {}),
			...(payload.changes.stationCode !== undefined
				? { source_code: payload.changes.stationCode }
				: {}),
			// Present-and-null clears the notes; an absent key leaves them alone. The
			// domain draws the same distinction, which is why this reads the key
			// rather than the value.
			...('metadata' in payload.changes ? { metadata: payload.changes.metadata ?? null } : {}),
			updated_by_profile_id: payload.actorProfileId,
		},
		{ duplicate: DUPLICATE_STATION },
	);
}

async function moveStation(
	trx: WeatherTransaction,
	payload: LocationPayload,
): Promise<WeatherStationRow | null> {
	const station = await requireStation(trx, payload);
	if (station === null) {
		return null;
	}
	await assertHistoryAcknowledged(trx, {
		acknowledgement: 'acknowledgedHistoricalLocationChange',
		acknowledged: payload.acknowledgedHistoricalLocationChange,
		subject: 'station',
		rules: [stationSummaryRule(station.id)],
		message:
			'This station already has summaries. Summaries do not record where the station stood, so moving it moves all of them.',
	});
	return updateStation(trx, station.id, payload.organizationId, {
		geom: geojsonToGeom(payload.geometry),
		updated_by_profile_id: payload.actorProfileId,
	});
}

async function setStationActive(
	trx: WeatherTransaction,
	payload: LifecyclePayload,
	isActive: boolean,
): Promise<WeatherStationRow | null> {
	const station = await requireStation(trx, payload);
	if (station === null) {
		return null;
	}
	return updateStation(trx, station.id, payload.organizationId, {
		is_active: isActive,
		updated_by_profile_id: payload.actorProfileId,
	});
}

async function deleteStation(
	trx: WeatherTransaction,
	payload: DeletePayload,
): Promise<WeatherStationRow | null> {
	const station = await requireStation(trx, payload);
	if (station === null) {
		return null;
	}
	// The clearance shape rather than this module's own 409: the summaries are a
	// counted row set about to disappear, which is what
	// `acknowledgement_required` says on every other surface, and the count is
	// what the client needs to write the sentence. The station's other two
	// acknowledgements still answer with the older body; #315 unifies them.
	//
	// `weather_summaries` is why the match is spelled out in full. It has no
	// `deleted_at` and a nullable `organization_id`, so the filters the delete
	// registry applies to every rule would find none of these rows, and it is
	// also why a station cannot be a `DeletableRecordType`.
	await assertClearanceAcknowledged(trx, {
		acknowledgement: 'acknowledgedSummaryDeletion',
		acknowledged: payload.acknowledgedSummaryDeletion,
		rules: [
			{
				key: 'stationSummaries',
				table: 'weather_summaries',
				singular: 'summary',
				plural: 'summaries',
				match: sql`weather_source_id = ${station.id}`,
			},
		],
	});
	// Ahead of the soft delete, not after it. Summaries have no `deleted_at` of
	// their own, so a station left behind with its rows would keep them alive and
	// unreachable, and reachable again if the row were ever undeleted.
	await trx.deleteFrom('weather_summaries').where('weather_source_id', '=', station.id).execute();
	const row = await trx
		.updateTable('weather_sources')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: payload.actorProfileId,
			updated_by_profile_id: payload.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', station.id)
		.where('organization_id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.returning(weatherStationReturnColumns)
		.executeTakeFirst();
	return row ?? null;
}

/**
 * The station a mutation names, checked for ownership and staleness in one step.
 *
 * `null` rather than a throw for a missing row, because `runCommands` already
 * turns a null tail into the 404 named after the entity, and "not this agency's"
 * and "not there" are the same answer, deliberately, so that probing ids tells a
 * caller nothing.
 */
async function requireStation(
	trx: WeatherTransaction,
	payload: {
		readonly weatherStationId: string;
		readonly organizationId: string;
		readonly expectedUpdatedAt: Date | null;
	},
): Promise<StationState | null> {
	const station = await loadStation(trx, payload.weatherStationId, payload.organizationId);
	if (station === undefined) {
		return null;
	}
	assertFresh(payload.expectedUpdatedAt, station.updatedAt, 'weather_station');
	return station;
}

async function updateStation(
	trx: WeatherTransaction,
	weatherStationId: string,
	organizationId: string,
	set: Record<string, unknown>,
	refusals: { readonly duplicate?: { readonly error: string; readonly reason: string } } = {},
): Promise<WeatherStationRow | null> {
	const row = await refusableWrite(
		() =>
			trx
				.updateTable('weather_sources')
				.set({ ...set, updated_at: sql`now()` } as never)
				.where('id', '=', weatherStationId)
				.where('organization_id', '=', organizationId)
				.where('deleted_at', 'is', null)
				.returning(weatherStationReturnColumns)
				.executeTakeFirst(),
		refusals,
	);
	return row ?? null;
}
