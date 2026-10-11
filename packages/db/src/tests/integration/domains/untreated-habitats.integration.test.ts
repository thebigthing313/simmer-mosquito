import { expect, it } from 'vitest';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';
import { seedUntreatedWorld, UNTREATED_BOUNDS, UNTREATED_TIME_ZONE } from './untreated-world.js';

// --- the habitats explorer's untreated filter --------------------------------
//
// `untreatedHabitatSql` reads four tables beside `inspections`, so the
// rule is seeded and read back rather than pinned as text. Each habitat in
// `untreated-world.ts` is one state the rule names, and the answer is the set
// of ids that qualify, so a predicate that stopped reading one table changes
// the set.
//
// These are the cases the Dashboard banner carried until #1211 removed it,
// moved onto the one reader left, plus the shapes a query starting from the
// inspections in the window could get wrong (#1212): both edges of the window,
// a later reading dated after today, two readings on one day, a deleted action
// and another organization's rows.

describeDbIntegration('untreated habitats', () => {
	it('filters habitats to the untreated rule and nothing wider', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedUntreatedWorld(db);

			const result = await MAP_SURFACES.habitats.listByBounds(db, {
				organizationId: world.organizationId,
				timeZone: UNTREATED_TIME_ZONE,
				bounds: UNTREATED_BOUNDS,
				filters: { untreatedOnly: true },
				limit: 100,
				offset: 0,
			});

			expect(new Set(result.rows.map((row) => row.id))).toEqual(new Set(world.untreated));
			expect(result.total).toBe(world.untreated.length);
		});
	});
});
