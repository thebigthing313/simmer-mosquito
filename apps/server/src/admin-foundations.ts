import {
	createUnitWithTxid,
	deleteUnitWithTxid,
	getOperatorOrganization,
	listAddresses,
	listGenera,
	listOrganizationSpecies,
	listOrgLookups,
	listRegionFolders,
	listRegions,
	listSpecies,
	listTraps,
	type SafeAddress,
	type SafeGenus,
	type SafeOrganizationSpecies,
	type SafeOrgLookup,
	type SafeRegion,
	type SafeRegionFolder,
	type SafeSpecies,
	type SafeTrap,
	type SafeUnit,
	type UnitSystem,
	type UnitType,
	updateUnitWithTxid,
} from '@simmer-mosquito/db';
import type { Context, Hono } from 'hono';
import type { AuthVariables, createOperatorAuthContextMiddleware } from './auth-middleware.js';
import { isRecord } from './command-payload.js';

type AdminFoundationDb = Parameters<typeof getOperatorOrganization>[0];

/** Postgres refusing to orphan a row: `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * A delete the database may refuse, separated from one that failed.
 *
 * The global catalogs are deliberately restrictive — a unit an agency still
 * measures in — and the console *says so* before asking for confirmation. But
 * nothing caught the refusal, so Postgres's error left as an unhandled 500 with
 * a plain-text body, and the console could only report "Server response was
 * unreadable" about a rule it had just explained.
 *
 * Only `23503` is answered. Anything else still throws, because a delete that
 * failed for some other reason is not a rule being enforced.
 *
 * The taxonomy makes the same argument through `/commands/{table}` — see
 * `foreignKeyRefusal` in `table-commands/taxonomy.ts`, which raises the same
 * 409 from inside the command transaction.
 */
async function deleteOrExplain<TResult>(
	run: () => Promise<TResult>,
): Promise<{ readonly ok: true; readonly result: TResult } | { readonly ok: false }> {
	try {
		return { ok: true, result: await run() };
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { readonly code: unknown }).code === FOREIGN_KEY_VIOLATION
		) {
			return { ok: false };
		}

		throw error;
	}
}

// --- what the operator control plane still owns ------------------------------
//
// Two kinds of thing, and the difference is the whole of ADR 0011.
//
// **Global catalogs** — units. SIMMER controls these; no agency route writes
// them and no agency membership is relevant to them. They are operator-owned by
// nature and stay here.
//
// Genera and species were here too, and are not any more. They were the second
// door on the taxonomy: `createGenusWithTxid` and its siblings called straight
// from a route, so a genus written here was validated by a hand-rolled payload
// reader, attributed to nobody, and checked against no permission map, while
// `/commands/genera` wrote the same row through a domain command behind the
// operator floor. Two doors with different checks is the thing that surface
// exists to remove, so these six routes are gone and `apps/admin` posts intents.
// The `*WithTxid` helpers went with them — nothing else called them.
//
// **Reads of one agency's foundations**, so an operator can see whether an
// agency is ready to work without joining it. Reading is not the problem #120
// found; writing behind a second set of rules was.
//
// The writes are gone. Six tables — addresses, region folders, regions, the
// organization lookups, organization species, traps — were created here without
// a domain builder in sight, which meant a region created by an operator and a
// region created by an agency were validated differently and only one of them
// could say who made it. An operator who is going to write those rows now joins
// the agency and posts to `/foundation/*` and `/adult-surveillance/*` like
// anyone else. Nine payload interfaces, twelve payload readers, and the
// primitive readers only they used went with them.

export function registerAdminFoundationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdminFoundationDb;
		readonly operatorAuthContextMiddleware: ReturnType<typeof createOperatorAuthContextMiddleware>;
	},
): void {
	app.get(
		'/admin/organizations/:organizationId/foundations',
		options.operatorAuthContextMiddleware,
		async (context) => {
			const organizationId = context.req.param('organizationId');
			const organization = await getOperatorOrganization(options.db, organizationId);
			if (organization === null) {
				return context.json({ error: 'organization_not_found' }, 404);
			}

			const [
				addresses,
				regionFolders,
				regions,
				genera,
				species,
				organizationSpecies,
				collectionMethods,
				collectionLures,
				habitatTypes,
				traps,
			] = await Promise.all([
				listAddresses(options.db, organizationId),
				listRegionFolders(options.db, organizationId),
				listRegions(options.db, organizationId),
				listGenera(options.db),
				listSpecies(options.db),
				listOrganizationSpecies(options.db, organizationId),
				listOrgLookups(options.db, 'collection_methods', organizationId),
				listOrgLookups(options.db, 'collection_lures', organizationId),
				listOrgLookups(options.db, 'habitat_types', organizationId),
				listTraps(options.db, organizationId),
			]);

			return context.json({
				addresses: addresses.map(toAddressResponse),
				regionFolders: regionFolders.map(toRegionFolderResponse),
				regions: regions.map(toRegionResponse),
				genera: genera.map(toGenusResponse),
				species: species.map(toSpeciesResponse),
				organizationSpecies: organizationSpecies.map(toOrganizationSpeciesResponse),
				lookups: {
					collectionMethods: collectionMethods.map(toOrgLookupResponse),
					collectionLures: collectionLures.map(toOrgLookupResponse),
					habitatTypes: habitatTypes.map(toOrgLookupResponse),
				},
				traps: traps.map(toTrapResponse),
			});
		},
	);

	app.post('/admin/units', options.operatorAuthContextMiddleware, async (context) => {
		const payloadResult = await readUnitPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await createUnitWithTxid(options.db, payloadResult.payload);
		return context.json({ unit: toUnitResponse(result.row), txid: result.txid }, 201);
	});

	app.patch('/admin/units/:unitId', options.operatorAuthContextMiddleware, async (context) => {
		const payloadResult = await readUnitPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await updateUnitWithTxid(
			options.db,
			context.req.param('unitId'),
			payloadResult.payload,
		);
		if (result.row === null) {
			return context.json({ error: 'unit_not_found' }, 404);
		}

		return context.json({ unit: toUnitResponse(result.row), txid: result.txid });
	});

	app.delete('/admin/units/:unitId', options.operatorAuthContextMiddleware, async (context) => {
		const outcome = await deleteOrExplain(() =>
			deleteUnitWithTxid(options.db, context.req.param('unitId')),
		);
		if (!outcome.ok) {
			return context.json(
				{
					error: 'unit_in_use',
					reason: 'This unit is still referenced by an agency’s records or settings.',
				},
				409,
			);
		}

		if (outcome.result.row === null) {
			return context.json({ error: 'unit_not_found' }, 404);
		}

		return context.json({ unit: toUnitResponse(outcome.result.row), txid: outcome.result.txid });
	});

	app.get(
		'/admin/organizations/:organizationId/traps',
		options.operatorAuthContextMiddleware,
		async (context) => {
			const guard = await assertOperatorOrganization(context, options);
			if (!guard.ok) {
				return context.json({ error: guard.error }, guard.status);
			}

			const traps = await listTraps(options.db, guard.organizationId);
			return context.json({ traps: traps.map(toTrapResponse) });
		},
	);
}

async function assertOperatorOrganization(
	context: Context<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdminFoundationDb;
	},
): Promise<
	| { readonly ok: true; readonly organizationId: string }
	| { readonly ok: false; readonly status: 403 | 404; readonly error: string }
> {
	const organizationId = context.req.param('organizationId');
	if (organizationId === undefined) {
		return { ok: false, status: 404, error: 'organization_not_found' };
	}
	const organization = await getOperatorOrganization(options.db, organizationId);
	if (organization === null) {
		return { ok: false, status: 404, error: 'organization_not_found' };
	}

	return { ok: true, organizationId };
}

interface UnitPayload {
	readonly id?: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

async function readUnitPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<UnitPayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const code = readRequiredText(raw.code);
	const unitName = readRequiredText(raw.unitName);
	const abbreviation = readRequiredText(raw.abbreviation);
	const unitType = readUnitType(raw.unitType);
	const unitSystem = readUnitSystem(raw.unitSystem);
	if (code === null || unitName === null || abbreviation === null) {
		return invalid('code, unitName, and abbreviation are required.');
	}
	if (unitType === null) {
		return invalid(
			'unitType must be weight, distance, area, volume, temperature, duration, count, or speed.',
		);
	}
	if (unitSystem === null) {
		return invalid('unitSystem must be si, imperial, or us_customary.');
	}
	const id = readOptionalUuid(raw.id);
	if (id === undefined) {
		return invalid('id must be a UUID when provided.');
	}

	return {
		ok: true,
		payload: {
			...(id === null ? {} : { id }),
			code,
			unitName,
			abbreviation,
			unitType,
			unitSystem,
		},
	};
}

function readUnitType(value: unknown): UnitType | null {
	if (
		value === 'weight' ||
		value === 'distance' ||
		value === 'area' ||
		value === 'volume' ||
		value === 'temperature' ||
		value === 'duration' ||
		value === 'count' ||
		value === 'speed'
	) {
		return value;
	}

	return null;
}

function readUnitSystem(value: unknown): UnitSystem | null {
	if (value === 'si' || value === 'imperial' || value === 'us_customary') {
		return value;
	}

	return null;
}

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<Record<string, unknown>>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return invalid('Request body must be JSON.');
	}

	if (!isRecord(raw)) {
		return invalid('Request body must be an object.');
	}

	return { ok: true, payload: raw };
}

function readRequiredText(value: unknown): string | null {
	return readOptionalText(value);
}

function readOptionalText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalUuid(value: unknown): string | null | undefined {
	const text = readOptionalText(value);
	if (text === null) {
		return null;
	}

	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
		? text
		: undefined;
}

function invalid(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

function toAddressResponse(address: SafeAddress) {
	return {
		id: address.id,
		organizationId: address.organizationId,
		geometry: address.geometry,
		displayName: address.displayName,
		country: address.country,
		addressLine1: address.addressLine1,
		addressLine2: address.addressLine2,
		locality: address.locality,
		region: address.region,
		postalCode: address.postalCode,
		createdAt: address.createdAt,
		updatedAt: address.updatedAt,
	};
}

function toRegionFolderResponse(folder: SafeRegionFolder) {
	return {
		id: folder.id,
		organizationId: folder.organizationId,
		name: folder.name,
		description: folder.description,
		createdAt: folder.createdAt,
		updatedAt: folder.updatedAt,
	};
}

function toRegionResponse(region: SafeRegion) {
	return {
		id: region.id,
		organizationId: region.organizationId,
		regionFolderId: region.regionFolderId,
		geometry: region.geometry,
		name: region.name,
		description: region.description,
		metadata: region.metadata,
		createdAt: region.createdAt,
		updatedAt: region.updatedAt,
	};
}

function toGenusResponse(genus: SafeGenus) {
	return {
		id: genus.id,
		abbreviation: genus.abbreviation,
		name: genus.name,
		createdAt: genus.createdAt,
		updatedAt: genus.updatedAt,
	};
}

function toSpeciesResponse(species: SafeSpecies) {
	return {
		id: species.id,
		genusId: species.genusId,
		epithet: species.epithet,
		commonName: species.commonName,
		displayName: species.displayName,
		createdAt: species.createdAt,
		updatedAt: species.updatedAt,
	};
}

function toUnitResponse(unit: SafeUnit) {
	return {
		id: unit.id,
		code: unit.code,
		unitName: unit.unitName,
		abbreviation: unit.abbreviation,
		unitType: unit.unitType,
		unitSystem: unit.unitSystem,
		createdAt: unit.createdAt,
	};
}

function toOrganizationSpeciesResponse(row: SafeOrganizationSpecies) {
	return {
		id: row.id,
		organizationId: row.organizationId,
		speciesId: row.speciesId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toOrgLookupResponse(row: SafeOrgLookup) {
	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		description: row.description,
		customSchema: row.customSchema,
		actionThreshold: row.actionThreshold,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function toTrapResponse(trap: SafeTrap) {
	return {
		id: trap.id,
		organizationId: trap.organizationId,
		geometry: trap.geometry,
		collectionMethodId: trap.collectionMethodId,
		addressId: trap.addressId,
		collectionLureId: trap.collectionLureId,
		trapName: trap.trapName,
		trapCode: trap.trapCode,
		description: trap.description,
		isActive: trap.isActive,
		createdAt: trap.createdAt,
		updatedAt: trap.updatedAt,
	};
}
