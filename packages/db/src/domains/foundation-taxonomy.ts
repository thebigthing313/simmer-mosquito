import { sql } from 'kysely';

import type { DbExecutor } from '../index.js';

/**
 * The global catalogs are read here and written through commands.
 *
 * Every write this file had is gone. `createGenus`, `updateSpecies`, `createUnit`
 * and their nine `*WithTxid` wrappers were called straight from `/admin/genera`,
 * `/admin/species` and `/admin/units`; `table-commands/taxonomy.ts` and
 * `table-commands/units.ts` write those rows from a domain command now.
 *
 * They could not have been reused as they stood, and the reason is worth
 * recording: `updateGenus`, `updateSpecies` and `updateUnit` `.set()` every
 * column unconditionally, so they were whole-row replacements wearing an update's
 * name. `updateSpecies` in particular wrote `genus_id: input.genusId ?? null`,
 * which would have detached a species from its genus on any edit that did not
 * restate it.
 *
 * What is left is the reads the operator console's per-organization foundations
 * view needs. `listUnits` is not among them — the console reads units through
 * their Electric shape like every other table.
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
