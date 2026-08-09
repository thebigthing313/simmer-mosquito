import {
	createGenusWithTxid,
	createSpeciesWithTxid,
	createUnitWithTxid,
	deleteGenusWithTxid,
	deleteSpeciesWithTxid,
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
	updateGenusWithTxid,
	updateSpeciesWithTxid,
	updateUnitWithTxid,
} from '@simmer-mosquito/db';
import type { Context, Hono } from 'hono';
import type { AuthVariables, createOperatorAuthContextMiddleware } from './auth-middleware.js';
import { isRecord } from './command-payload.js';

type AdminFoundationDb = Parameters<typeof getOperatorOrganization>[0];

// --- what the operator control plane still owns ------------------------------
//
// Two kinds of thing, and the difference is the whole of ADR 0011.
//
// **Global catalogs** — genera, species, units. SIMMER controls these; no agency
// route writes them and no agency membership is relevant to them. They are
// operator-owned by nature and stay here.
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

	app.post('/admin/genera', options.operatorAuthContextMiddleware, async (context) => {
		const payloadResult = await readGenusPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await createGenusWithTxid(options.db, payloadResult.payload);
		return context.json({ genus: toGenusResponse(result.row), txid: result.txid }, 201);
	});

	app.patch('/admin/genera/:genusId', options.operatorAuthContextMiddleware, async (context) => {
		const payloadResult = await readGenusPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await updateGenusWithTxid(
			options.db,
			context.req.param('genusId'),
			payloadResult.payload,
		);
		if (result.row === null) {
			return context.json({ error: 'genus_not_found' }, 404);
		}

		return context.json({ genus: toGenusResponse(result.row), txid: result.txid });
	});

	app.delete('/admin/genera/:genusId', options.operatorAuthContextMiddleware, async (context) => {
		const result = await deleteGenusWithTxid(options.db, context.req.param('genusId'));
		if (result.row === null) {
			return context.json({ error: 'genus_not_found' }, 404);
		}

		return context.json({ genus: toGenusResponse(result.row), txid: result.txid });
	});

	app.post('/admin/species', options.operatorAuthContextMiddleware, async (context) => {
		const payloadResult = await readSpeciesPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await createSpeciesWithTxid(options.db, payloadResult.payload);
		return context.json({ species: toSpeciesResponse(result.row), txid: result.txid }, 201);
	});

	app.patch('/admin/species/:speciesId', options.operatorAuthContextMiddleware, async (context) => {
		const payloadResult = await readSpeciesPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await updateSpeciesWithTxid(
			options.db,
			context.req.param('speciesId'),
			payloadResult.payload,
		);
		if (result.row === null) {
			return context.json({ error: 'species_not_found' }, 404);
		}

		return context.json({ species: toSpeciesResponse(result.row), txid: result.txid });
	});

	app.delete(
		'/admin/species/:speciesId',
		options.operatorAuthContextMiddleware,
		async (context) => {
			const result = await deleteSpeciesWithTxid(options.db, context.req.param('speciesId'));
			if (result.row === null) {
				return context.json({ error: 'species_not_found' }, 404);
			}

			return context.json({ species: toSpeciesResponse(result.row), txid: result.txid });
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
		const result = await deleteUnitWithTxid(options.db, context.req.param('unitId'));
		if (result.row === null) {
			return context.json({ error: 'unit_not_found' }, 404);
		}

		return context.json({ unit: toUnitResponse(result.row), txid: result.txid });
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

interface GenusPayload {
	readonly id?: string;
	readonly abbreviation: string;
	readonly name: string;
}

interface SpeciesPayload {
	readonly id?: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
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

async function readGenusPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<GenusPayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const abbreviation = readRequiredText(rawResult.payload.abbreviation);
	const name = readRequiredText(rawResult.payload.name);
	if (abbreviation === null || name === null) {
		return invalid('abbreviation and name are required.');
	}
	const id = readOptionalUuid(rawResult.payload.id);
	if (id === undefined) {
		return invalid('id must be a UUID when provided.');
	}

	return { ok: true, payload: { ...(id === null ? {} : { id }), abbreviation, name } };
}

async function readSpeciesPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<SpeciesPayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const epithet = readRequiredText(raw.epithet);
	const displayName = readRequiredText(raw.displayName);
	if (epithet === null || displayName === null) {
		return invalid('epithet and displayName are required.');
	}
	const id = readOptionalUuid(raw.id);
	if (id === undefined) {
		return invalid('id must be a UUID when provided.');
	}

	return {
		ok: true,
		payload: {
			...(id === null ? {} : { id }),
			genusId: readOptionalText(raw.genusId),
			epithet,
			commonName: readOptionalText(raw.commonName),
			displayName,
		},
	};
}

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
