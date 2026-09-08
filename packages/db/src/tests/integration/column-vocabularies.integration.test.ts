import { COLUMN_VOCABULARIES } from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import { sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

/**
 * The register against the catalog, both ways.
 *
 * `pnpm check:column-vocabularies` already compares the register to
 * `packages/db/schema.sql`, and that gate runs on every push with no database.
 * This is the half it cannot do: the dump is a file somebody has to remember to
 * regenerate, and this applies the migrations into a throwaway schema and reads
 * the types back out of `pg_enum`. If the two ever disagree, the dump is stale
 * and the static gate has been answering from it.
 *
 * `enumsortorder` rather than the catalog's natural order, because order is part
 * of the contract: `none, light, medium, heavy, very_heavy` is what lets the
 * inspections legend, the density select and the map ramp read one list instead
 * of writing three.
 *
 * Reading the catalog rather than the migration text is deliberate.
 * `202605140001` renames `notification_channel`, creates a three-member one, and
 * its `-- migrate:down` half restores the four-member one, so a scan of the
 * migrations answers with the rollback. That is the third time this repo has
 * paid for parsing migration SQL, after #123.
 */
describeDbIntegration('column vocabularies', () => {
	it('are the enum types the migrations create, in the order the catalog gives them', async () => {
		await withTestDb(async ({ db }) => {
			const rows = await sql<{
				readonly type_name: string;
				readonly members: string[];
			}>`
				select
					t.typname as type_name,
					-- Cast to text: the driver has no parser for an array of name, and
					-- hands one back as the raw {a,b} literal instead of an array.
					array_agg(e.enumlabel::text order by e.enumsortorder) as members
				from pg_type t
				join pg_enum e on e.enumtypid = t.oid
				join pg_namespace n on n.oid = t.typnamespace
				where n.nspname = current_schema()
				group by t.typname
			`.execute(db);

			const database = Object.fromEntries(rows.rows.map((row) => [row.type_name, row.members]));

			// One `toEqual` over both objects rather than a loop, so a type on
			// either side alone shows up as the diff it is. A loop over the register
			// would pass an eighteenth enum type nobody registered.
			expect(database).toEqual(
				Object.fromEntries(
					Object.entries(COLUMN_VOCABULARIES).map(([name, members]) => [name, [...members]]),
				),
			);
		});
	});
});
