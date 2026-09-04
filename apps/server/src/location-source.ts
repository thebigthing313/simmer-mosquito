/**
 * Geometry for a command that carries a location source.
 *
 * `CONTEXT.md` names Location Source Flow as a first-class concept and
 * `packages/domain/src/location-intent.ts` implements it: nine discriminated
 * source types, eight per-workflow unions built from them, and a whitelist per
 * workflow that rejects an out-of-flow kind before a command reaches a handler.
 *
 * Four resolvers in this app used to declare their source as
 * `{ readonly kind: string } & Record<string, unknown>`. A `TrapLocationSource`
 * is structurally assignable to that, so every call site compiled while silently
 * widening a two-member union back into a bag — and each resolver then re-derived
 * the discrimination it had just discarded, with `as string` casts and a switch.
 *
 * Those four switches were also a second, looser copy of the whitelist: the
 * larval one accepted `serviceRequest`, which `HABITAT_LOCATION_SOURCE_KINDS`
 * forbids. That arm was unreachable, and nothing said so.
 *
 * `docs/domain-command-contract.md` gives the split this module keeps: builders
 * own which sources a workflow permits, handlers own the lookup and snapshot.
 * So this resolves over the whole `LocationSource` union and does not check the
 * kind at all. The `never` arm is the point — a tenth source term added to the
 * domain becomes a build error here, which is the property the four switches
 * never had.
 */

import {
	type GeomTable,
	geojsonToGeom,
	loadGeojson,
	type RawBuilder,
	type SimmerDatabase,
	type Transaction,
} from '@simmer-mosquito/db';
import { geometryCoversGround, type LocationSource } from '@simmer-mosquito/domain';

import { CommandError } from './command-endpoint.js';

export async function resolveLocationGeom(
	trx: Transaction<SimmerDatabase>,
	organizationId: string,
	source: LocationSource,
): Promise<RawBuilder<string>> {
	switch (source.kind) {
		case 'geometry':
			return geojsonToGeom(source.geometry);
		case 'address':
			return loadOr404(trx, 'addresses', source.addressId, organizationId);
		case 'habitat':
			return loadOr404(trx, 'habitats', source.habitatId, organizationId);
		case 'inspection':
			return loadOr404(trx, 'inspections', source.inspectionId, organizationId);
		case 'trap':
			return loadOr404(trx, 'traps', source.trapId, organizationId);
		case 'collection':
			return loadOr404(trx, 'collections', source.collectionId, organizationId);
		case 'serviceRequest':
			return loadOr404(trx, 'service_requests', source.serviceRequestId, organizationId);
		case 'requestedControlAction':
			return loadOr404(
				trx,
				'requested_control_actions',
				source.requestedControlActionId,
				organizationId,
			);
		case 'missionItem':
			return loadOr404(trx, 'mission_items', source.missionItemId, organizationId);
		default: {
			// Not a runtime fallback: if this stops compiling, the domain grew a
			// source term and this switch has to answer for it.
			const unreachable: never = source;
			return unreachable;
		}
	}
}

/**
 * Another row's geometry, or the 404 its absence means.
 *
 * `loadGeojson` lives in `packages/db` and answers `undefined`, because "absent,
 * another agency's, or deleted" is one fact at that layer and the HTTP status it
 * becomes is this one's to name.
 */
export async function loadOr404(
	trx: Transaction<SimmerDatabase>,
	table: GeomTable,
	id: string,
	organizationId: string,
): Promise<RawBuilder<string>> {
	const geojson = await loadGeojson(trx, table, id, organizationId);
	if (geojson === undefined) {
		throw new CommandError(404, { error: `${table}_not_found` });
	}
	// The covers-ground rule on the inherited path. `validateGeometry` refuses a
	// drawn geometry and `geojsonToGeom` is the backstop, but this is the only
	// layer that knows which record the geometry came from, so "go fix that
	// habitat" is sayable only here. Nothing in production is in this state; the
	// induction that an inherited geometry needs no normalization holds today by
	// measurement, and this is what makes it hold by construction.
	if (!geometryCoversGround(geojson)) {
		throw new CommandError(400, {
			error: 'source_geometry_covers_no_ground',
			source: { table, id },
		});
	}
	return geojsonToGeom(geojson);
}
