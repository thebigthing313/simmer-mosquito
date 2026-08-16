import { type Kysely, sql } from 'kysely';

import type {
	CreateUnitInput,
	DbExecutor,
	MutationWriteResult,
	SafeUnit,
	SimmerDatabase,
	UnitSystem,
	UnitType,
	UpdateUnitInput,
} from '../index.js';

/**
 * The taxonomy is read here and written through commands.
 *
 * `createGenus`, `updateSpecies` and their six `*WithTxid` wrappers used to live
 * in this file, called straight from `/admin/genera` and `/admin/species`. They
 * are gone: `apps/server/src/table-commands/taxonomy.ts` writes those rows from
 * a domain command now, and it could not have reused them anyway — `updateGenus`
 * and `updateSpecies` `.set()` every column unconditionally, so `updateSpecies`
 * would have detached a species from its genus on any edit that did not restate
 * `genusId`. What is left here is the two list reads the operator console's
 * foundations view still needs.
 */
export interface SafeGenus {
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface SafeSpecies {
	readonly id: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface EnableOrganizationSpeciesInput {
	readonly organizationSpeciesId?: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeOrganizationSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export async function listGenera(db: DbExecutor): Promise<SafeGenus[]> {
	const rows = await db
		.selectFrom('genera')
		.select(['id', 'abbreviation', 'name', 'created_at', 'updated_at'])
		.orderBy('name', 'asc')
		.execute();

	return rows.map(toSafeGenus);
}

export async function listSpecies(db: DbExecutor): Promise<SafeSpecies[]> {
	const rows = await db
		.selectFrom('species')
		.select([
			'id',
			'genus_id',
			'epithet',
			'common_name',
			'display_name',
			'created_at',
			'updated_at',
		])
		.orderBy('display_name', 'asc')
		.execute();

	return rows.map(toSafeSpecies);
}

export async function listUnits(db: DbExecutor): Promise<SafeUnit[]> {
	const rows = await db
		.selectFrom('units')
		.select(['id', 'code', 'unit_name', 'abbreviation', 'unit_type', 'unit_system', 'created_at'])
		.orderBy('unit_type', 'asc')
		.orderBy('unit_name', 'asc')
		.execute();

	return rows.map(toSafeUnit);
}

export async function createUnit(db: DbExecutor, input: CreateUnitInput): Promise<SafeUnit> {
	const row = await db
		.insertInto('units')
		.values({
			...(input.id === undefined ? {} : { id: input.id }),
			code: input.code,
			unit_name: input.unitName,
			abbreviation: input.abbreviation,
			unit_type: input.unitType,
			unit_system: input.unitSystem,
		})
		.returning([
			'id',
			'code',
			'unit_name',
			'abbreviation',
			'unit_type',
			'unit_system',
			'created_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeUnit(row);
}

export async function createUnitWithTxid(
	db: Kysely<SimmerDatabase>,
	input: CreateUnitInput,
): Promise<MutationWriteResult<SafeUnit>> {
	return db.transaction().execute(async (trx) => {
		const row = await createUnit(trx, input);
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
}

export async function updateUnit(
	db: DbExecutor,
	unitId: string,
	input: UpdateUnitInput,
): Promise<SafeUnit | null> {
	const row = await db
		.updateTable('units')
		.set({
			code: input.code,
			unit_name: input.unitName,
			abbreviation: input.abbreviation,
			unit_type: input.unitType,
			unit_system: input.unitSystem,
		})
		.where('id', '=', unitId)
		.returning([
			'id',
			'code',
			'unit_name',
			'abbreviation',
			'unit_type',
			'unit_system',
			'created_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeUnit(row);
}

export async function updateUnitWithTxid(
	db: Kysely<SimmerDatabase>,
	unitId: string,
	input: UpdateUnitInput,
): Promise<MutationWriteResult<SafeUnit | null>> {
	return db.transaction().execute(async (trx) => {
		const row = await updateUnit(trx, unitId, input);
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
}

export async function deleteUnit(db: DbExecutor, unitId: string): Promise<SafeUnit | null> {
	const row = await db
		.deleteFrom('units')
		.where('id', '=', unitId)
		.returning([
			'id',
			'code',
			'unit_name',
			'abbreviation',
			'unit_type',
			'unit_system',
			'created_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeUnit(row);
}

export async function deleteUnitWithTxid(
	db: Kysely<SimmerDatabase>,
	unitId: string,
): Promise<MutationWriteResult<SafeUnit | null>> {
	return db.transaction().execute(async (trx) => {
		const row = await deleteUnit(trx, unitId);
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
}

export async function enableOrganizationSpecies(
	db: DbExecutor,
	input: EnableOrganizationSpeciesInput,
): Promise<SafeOrganizationSpecies> {
	const row = await db
		.insertInto('organization_species')
		.values({
			...(input.organizationSpeciesId === undefined ? {} : { id: input.organizationSpeciesId }),
			organization_id: input.organizationId,
			species_id: input.speciesId,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
			deleted_at: null,
			deleted_by_profile_id: null,
		})
		.onConflict((oc) =>
			oc.columns(['organization_id', 'species_id']).doUpdateSet({
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
				updated_at: sql`now()`,
				deleted_at: null,
				deleted_by_profile_id: null,
			}),
		)
		.returning([
			'id',
			'organization_id',
			'species_id',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeOrganizationSpecies(row);
}

export async function listOrganizationSpecies(
	db: DbExecutor,
	organizationId: string,
): Promise<SafeOrganizationSpecies[]> {
	const rows = await db
		.selectFrom('organization_species')
		.select([
			'id',
			'organization_id',
			'species_id',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('created_at', 'asc')
		.execute();

	return rows.map(toSafeOrganizationSpecies);
}

async function readCurrentTransactionId(db: DbExecutor): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(db);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}

	return Number.parseInt(txid, 10);
}

function toSafeGenus(row: {
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeGenus {
	return {
		id: row.id,
		abbreviation: row.abbreviation,
		name: row.name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeSpecies(row: {
	readonly id: string;
	readonly genus_id: string | null;
	readonly epithet: string;
	readonly common_name: string | null;
	readonly display_name: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSpecies {
	return {
		id: row.id,
		genusId: row.genus_id,
		epithet: row.epithet,
		commonName: row.common_name,
		displayName: row.display_name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeUnit(row: {
	readonly id: string;
	readonly code: string;
	readonly unit_name: string;
	readonly abbreviation: string;
	readonly unit_type: UnitType;
	readonly unit_system: UnitSystem;
	readonly created_at: Date;
}): SafeUnit {
	return {
		id: row.id,
		code: row.code,
		unitName: row.unit_name,
		abbreviation: row.abbreviation,
		unitType: row.unit_type,
		unitSystem: row.unit_system,
		createdAt: row.created_at.toISOString(),
	};
}

function toSafeOrganizationSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly species_id: string;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOrganizationSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		speciesId: row.species_id,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
