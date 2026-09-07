/**
 * What a command response actually carries, read back off a real write.
 *
 * `returnColumns` derives its lists from the generated row schemas, and a unit
 * test of that is a tautology: it would compare `Object.keys` of a zod shape to
 * `Object.keys` of the same zod shape. What nothing checked before #635, and
 * what only Postgres can answer, is whether a write that passes one of those
 * lists to `.returning(...)` comes back with those keys and no others.
 *
 * Three of them are the reason to ask. `lat`, `lng` and `geom_type` are written
 * by a `before insert or update of geom` trigger rather than by the insert, so
 * they are in the response only if `RETURNING` sees what the trigger wrote. All
 * 13 geometry tables served from `apps/server` used to omit them.
 *
 * One table per write surface. `habitats` goes through a domain writer the way
 * `/commands/habitats` does; `units` goes through the operator writer, which
 * has no organization anywhere and hard-deletes rather than soft-deleting.
 */

import {
	createOrganization,
	createProfile,
	describeDbIntegration,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { createHabitatCommand, createUnitCommand } from '@simmer-mosquito/domain';
import { syncedColumnsOf, tableSchemas } from '@simmer-mosquito/sync/contract';
import { expect, it } from 'vitest';
import type { CommandTransaction } from '../../command-write.js';
import { unitTableCommands } from '../../table-commands/units.js';
import { writeHabitatCommand } from '../../writers/larval-surveillance/habitats.js';

const POINT = { type: 'Point' as const, coordinates: [-90.5, 35.5] };

/** The field names one table's row schema declares, which is the whole claim. */
function schemaColumns(table: keyof typeof tableSchemas): readonly string[] {
	return [...syncedColumnsOf(tableSchemas[table])].sort();
}

describeDbIntegration('a command response', () => {
	it('answers a habitat with the columns its row schema declares, centroid included', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const actorProfileId = await createProfile(db, organizationId);

			const row = await db.transaction().execute(async (trx) =>
				writeHabitatCommand(
					trx as CommandTransaction,
					createHabitatCommand({
						organizationId,
						actorProfileId,
						habitatId: crypto.randomUUID(),
						locationSource: { kind: 'geometry', geometry: POINT },
						description: 'Roadside ditch',
					}),
				),
			);

			expect(row).not.toBeNull();
			expect(Object.keys(row ?? {}).sort()).toEqual(schemaColumns('habitats'));
			// The three the trigger writes, named rather than left to the set
			// compare: a response can only carry them if `RETURNING` reads the row
			// after the trigger, and that is not something the type says.
			expect(row).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
			expect(row).toMatchObject({ geom_type: 'st_point' });
			// `geom` and `geojson` are `OMIT`ted from every row schema, so no
			// response carries the geometry itself.
			expect(row).not.toHaveProperty('geom');
			expect(row).not.toHaveProperty('geojson');
		});
	});

	it('answers a unit on the operator surface with the columns its row schema declares', async () => {
		await withTestDb(async ({ db }) => {
			const write = unitTableCommands(db).run.write;

			const row = await db.transaction().execute(async (trx) =>
				write(
					trx as CommandTransaction,
					createUnitCommand({
						operatorUserId: crypto.randomUUID(),
						unitId: crypto.randomUUID(),
						code: 'gal',
						unitName: 'gallon',
						abbreviation: 'gal',
						unitType: 'volume',
						unitSystem: 'us_customary',
					}),
				),
			);

			expect(row).not.toBeNull();
			expect(Object.keys(row ?? {}).sort()).toEqual(schemaColumns('units'));
		});
	});
});
