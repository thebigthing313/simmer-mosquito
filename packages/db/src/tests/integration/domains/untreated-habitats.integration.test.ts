import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { expect, it } from 'vitest';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';
import { seedUntreatedWorld, UNTREATED_BOUNDS, UNTREATED_TIME_ZONE } from './untreated-world.js';

// --- the habitats explorer's untreated filter --------------------------------
//
// `untreatedHabitatSql` reads `treatments` and `requested_control_actions`
// beside `inspections`, so the rule is seeded and read back rather than pinned
// as text. Each habitat in `untreated-world.ts` is one state the rule names,
// and the answer is the set of ids that qualify, so a predicate that stopped
// reading one table, or started reading another, changes the set.
//
// These are the cases the Dashboard banner carried until #1211 removed it,
// moved onto the one reader left, plus the shapes a query starting from the
// inspections in the window could get wrong (#1212): both edges of the window,
// a later reading dated after today, two readings on one day, a deleted
// Treatment and another organization's rows. A Source Reduction or Biocontrol
// Action after a heavy reading leaves the habitat on the list (#1735).
//
// The explorer's list and the map's tiles both filter through the predicate,
// and each is read here, so neither can keep an older rule than the other.

/** The slippy-map tile holding a point, at a zoom above the clustering cut-off. */
function tileAt(lng: number, lat: number, z: number) {
	const scale = 2 ** z;
	const x = Math.floor(((lng + 180) / 360) * scale);
	const rad = (lat * Math.PI) / 180;
	const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale);
	return { z, x, y };
}

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

	it('draws the same habitats on the untreated map tile', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedUntreatedWorld(db);

			// Every fixture sits on one point, so the tile holding it holds them all.
			const bytes = await MAP_SURFACES.habitats.getTile(db, {
				organizationId: world.organizationId,
				timeZone: UNTREATED_TIME_ZONE,
				...tileAt(-90.5, 35.5, 14),
				filters: { untreatedOnly: true },
			});

			const layer = new VectorTile(new PbfReader(bytes)).layers.habitats;
			const drawn = Array.from(
				{ length: layer?.length ?? 0 },
				(_unused, index) => layer?.feature(index).properties.id,
			);
			expect(new Set(drawn)).toEqual(new Set(world.untreated));
			expect(drawn).toHaveLength(world.untreated.length);
		});
	});
});
