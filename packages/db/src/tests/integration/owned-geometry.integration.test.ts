import { normalizeOwnedGeometry, OWNED_GEOMETRY_POLICIES } from '@simmer-mosquito/domain';
import {
	type GeoJsonGeometry,
	ownedCentroidFromGeoJson,
	type PlanarPath,
	splitRings,
} from '@simmer-mosquito/mapping';
import { corpusRegionFor, REGION_MEMBERSHIP_CORPUS } from '@simmer-mosquito/mapping/test-corpus';
import type { Kysely } from 'kysely';
import { expect, it } from 'vitest';
import {
	createAddress,
	geojsonToGeom,
	listHabitatDisplayRowsByBounds,
	type SimmerDatabase,
	sql,
} from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

/**
 * The GeoJSON name of each shape, keyed by the upper-cased form the DDL is read
 * in: `postgis_typmod_type` answers in mixed case and a CHECK carries the
 * upper-cased name, and the register speaks GeoJSON.
 *
 * All six are listed, so a column widened to a shape its policy row does not
 * name reads back as that shape and fails the comparison rather than going
 * unnoticed.
 */
const SHAPE_BY_UPPER_NAME: Readonly<Record<string, string>> = {
	POINT: 'Point',
	LINESTRING: 'LineString',
	POLYGON: 'Polygon',
	MULTIPOINT: 'MultiPoint',
	MULTILINESTRING: 'MultiLineString',
	MULTIPOLYGON: 'MultiPolygon',
};

/**
 * A habitat outline with a pond in it, and a line drawn straight across both.
 *
 * The shape of the hard case in the split corpus, at the magnitudes the database
 * actually stores. The pond straddles the line, so each half of its ring becomes
 * part of the outline of one piece and neither piece keeps a hole. A clip that
 * gets that wrong draws fine and is what PostGIS refuses at write, which is why
 * the answer is read back out of the database rather than off the client's own
 * covers-ground check.
 */
const SPLIT_OUTLINE: PlanarPath = [
	[-91, 34],
	[-91, 37],
	[-88, 37],
	[-88, 34],
];
const SPLIT_POND: PlanarPath = [
	[-90, 35],
	[-90, 36],
	[-89, 36],
	[-89, 35],
];
const SPLIT_LINE: PlanarPath = [
	[-89.5, 33],
	[-89.5, 38],
];

/**
 * Lines the corpus has no reason to hold, each named for what it pins.
 *
 * The first two are the bug: a length weighting and a vertex average agree on an
 * evenly spaced line and part company as the spacing gets uneven, and a
 * MultiLineString drifts further because a short dense part carries vertices
 * without carrying length. The last two have no length at all, so the weighting
 * has nothing to divide by and PostGIS decides what comes back instead.
 */
const LINEAR_EDGE_CASES: readonly (readonly [string, GeoJsonGeometry])[] = [
	[
		'line-with-a-long-last-span',
		{
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-89, 35],
				[-88, 35],
				[-80, 35],
			],
		},
	],
	[
		'multiline-with-a-short-dense-part',
		{
			type: 'MultiLineString',
			coordinates: [
				[
					[-90, 35],
					[-90, 36],
					[-90, 37],
				],
				[
					[-80, 40],
					[-80, 40.01],
					[-80, 40.02],
					[-80, 40.03],
					[-80, 40.04],
				],
			],
		},
	],
	[
		'line-of-one-repeated-position',
		{
			type: 'LineString',
			coordinates: [
				[-90.5, 35.5],
				[-90.5, 35.5],
				[-90.5, 35.5],
			],
		},
	],
	[
		'multiline-of-two-collapsed-parts',
		{
			type: 'MultiLineString',
			coordinates: [
				[
					[-90, 35],
					[-90, 35],
					[-90, 35],
				],
				[
					[-88, 37],
					[-88, 37],
				],
			],
		},
	],
];

/** What an unrestricted `geom` column will take. */
const EVERY_SHAPE: readonly string[] = Object.values(SHAPE_BY_UPPER_NAME);

describeDbIntegration('owned geometry columns', () => {
	it('stores direct address geometry without spatial feature indirection', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_owned_geometry',
					name: 'Owned Geometry District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const address = await createAddress(db, {
				organizationId: organization.id,
				geojson: { type: 'Point', coordinates: [-90.1234567, 35.7654321] },
				displayName: 'Field Office',
				country: 'US',
			});

			const row = await db
				.selectFrom('addresses')
				.select(['geojson', 'geom_type', 'lat', 'lng'])
				.where('id', '=', address.id)
				.executeTakeFirstOrThrow();

			expect(row.geojson).toEqual({ type: 'Point', coordinates: [-90.1234567, 35.7654321] });
			expect(row.geom_type).toBe('st_point');
			expect(row.lat).toBeCloseTo(35.7654321);
			expect(row.lng).toBeCloseTo(-90.1234567);
		});
	});

	it('recomputes centroid columns via trigger when geom changes', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_centroid_trigger',
					name: 'Centroid Trigger District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const inserted = await db
				.insertInto('habitats')
				.values({
					organization_id: organization.id,
					geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
					habitat_name: null,
					description: '',
					metadata: null,
				})
				.returning(['id', 'lat', 'lng', 'geom_type'])
				.executeTakeFirstOrThrow();

			// Trigger populates centroid columns on insert.
			expect(inserted.lat).toBeCloseTo(35.5);
			expect(inserted.lng).toBeCloseTo(-90.5);
			expect(inserted.geom_type).toBe('st_point');

			// Trigger recomputes them when geom is updated (a polygon this time).
			const updated = await db
				.updateTable('habitats')
				.set({
					geom: sql`st_setsrid(st_geomfromtext('POLYGON((0 0, 0 2, 2 2, 2 0, 0 0))'), 4326)`,
				})
				.where('id', '=', inserted.id)
				.returning(['lat', 'lng', 'geom_type'])
				.executeTakeFirstOrThrow();

			expect(updated.lat).toBeCloseTo(1);
			expect(updated.lng).toBeCloseTo(1);
			expect(updated.geom_type).toBe('st_polygon');
		});
	});

	it('lists habitat display rows with unnamed habitats ordered by uuid fallback', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_habitat_display',
					name: 'Habitat Display District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			await db
				.insertInto('habitats')
				.values({
					organization_id: organization.id,
					geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
					habitat_name: null,
					description: '',
					metadata: null,
				})
				.execute();

			const { rows } = await listHabitatDisplayRowsByBounds(db, {
				organizationId: organization.id,
				bounds: {
					west: -91,
					south: 35,
					east: -90,
					north: 36,
				},
				limit: 50,
				offset: 0,
			});

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				organizationId: organization.id,
				habitatName: null,
				geomType: 'st_point',
			});
		});
	});

	/**
	 * The register is the single source of which record kind stores which shapes;
	 * this is what holds it to the database. `pnpm check:geometry-policies` gates
	 * the TypeScript copies, and there is no static half for the DDL: reading the
	 * CHECKs out of the migration files means folding `add constraint`, `drop
	 * constraint` and `alter column type` across them in order, which is a small
	 * SQL interpreter, and `schema.sql` is not committed.
	 *
	 * Both halves of the DDL restrict a column, so the storable set is their
	 * intersection: the typmod from `postgis_typmod_type`, the accepted names from
	 * `pg_get_constraintdef`. A generic typmod restricts nothing and an absent
	 * CHECK restricts nothing.
	 *
	 * Never read `geometry_columns` for this. It falls back to the CHECK when the
	 * typmod is generic and takes the first quoted name with `split_part`, so all
	 * nine `geometry(Geometry,4326)` tables report `POINT` today.
	 *
	 * It iterates the register, so a new kind needs no edit here.
	 */
	it('stores the shapes the register says, on every table it names', async () => {
		await withTestDb(async ({ db, schemaName }) => {
			const storable = await readStorableShapes(db, schemaName);

			for (const policy of OWNED_GEOMETRY_POLICIES) {
				for (const table of policy.tables) {
					expect(storable.get(table), `${table} has no geom column`).toBeDefined();
					expect([...(storable.get(table) ?? [])].sort(), `${table} (${policy.kind})`).toEqual(
						[...policy.allowedTypes].sort(),
					);
				}
			}
		});
	});

	/**
	 * The other direction, which is what catches a sixteenth geometry table added
	 * with no registration. Without it the register can go stale by omission and
	 * every assertion above still passes.
	 */
	it('registers every table that holds a geometry', async () => {
		await withTestDb(async ({ db, schemaName }) => {
			const storable = await readStorableShapes(db, schemaName);
			const owners = new Map<string, string[]>();
			for (const policy of OWNED_GEOMETRY_POLICIES) {
				for (const table of policy.tables) {
					owners.set(table, [...(owners.get(table) ?? []), policy.kind]);
				}
			}

			for (const table of storable.keys()) {
				expect(owners.get(table), `${table} is in no policy row`).toHaveLength(1);
			}
			expect([...storable.keys()].sort()).toEqual([...owners.keys()].sort());
		});
	});

	/**
	 * A split committed the way a location command commits one.
	 *
	 * The draw control's own rule is `geometryCoversGround`, which answers for one
	 * ring at a time and has nothing to say about a hole clipped onto the wrong
	 * side. `normalizeOwnedGeometry` is the domain half of the location command and
	 * `geojsonToGeom` is the writer every one of them goes through, so the two of
	 * them plus a real `geom` column is the round trip.
	 *
	 * The two pieces share the line they were cut along, and OGC calls a
	 * MultiPolygon whose parts meet along an edge invalid. That is not a clip that
	 * went wrong: cutting one shape in two and keeping both in one geometry always
	 * ends there, and the alternative is two records, which #497 rules out. So
	 * `st_isvalid` is false and is asserted false rather than left unread, and the
	 * measurements that are read back are the ones the operations this schema runs
	 * depend on. `ST_Intersects` and `ST_Relate` answer correctly over it, which is
	 * what region membership reads. #518 carries the rest.
	 */
	it('writes the two pieces a split leaves, sharing the line they were cut along', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_split_geometry',
					name: 'Split Geometry District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const cut = splitRings({
				rings: [SPLIT_OUTLINE, SPLIT_POND],
				sketch: SPLIT_LINE,
				closed: true,
			});
			if (cut.kind !== 'split') {
				throw new Error(`The corpus shape did not split: ${cut.refusal}.`);
			}
			const geometry = normalizeOwnedGeometry('habitat', {
				type: 'MultiPolygon',
				coordinates: cut.parts.map((part) => part.map((ring) => [...ring, ...ring.slice(0, 1)])),
			});

			const habitat = await db
				.insertInto('habitats')
				.values({
					organization_id: organization.id,
					geom: geojsonToGeom(geometry),
					habitat_name: 'Split pond',
					description: '',
					metadata: null,
				})
				.returning(['id', 'geom_type'])
				.executeTakeFirstOrThrow();

			const read = await sql<{
				valid: boolean;
				pieces: number;
				rings: number;
				area: number;
				holds_pond: boolean;
				holds_block: boolean;
			}>`
				select
					st_isvalid(geom) as valid,
					st_numgeometries(geom) as pieces,
					(select sum(st_nrings(g.geom)) from st_dump(habitats.geom) g) as rings,
					st_area(geom) as area,
					st_contains(geom, st_setsrid(st_makepoint(-89.7, 35.5), 4326)) as holds_pond,
					st_contains(geom, st_setsrid(st_makepoint(-90.5, 35.5), 4326)) as holds_block
				from habitats
				where id = ${habitat.id}
			`.execute(db);

			expect(habitat.geom_type).toBe('st_multipolygon');
			expect(Number(read.rows[0]?.pieces)).toBe(2);
			// One ring each: the pond the line crossed is boundary now, not a hole.
			expect(Number(read.rows[0]?.rings)).toBe(2);
			// Nine square degrees of block less one of pond, which is the arithmetic
			// that fails when an arc of the pond lands on the wrong side of the cut.
			expect(Number(read.rows[0]?.area)).toBeCloseTo(8);
			// The pond is still out and the rest of the block still in, so the ring
			// that stopped being a hole is doing the same job as boundary.
			expect(read.rows[0]?.holds_pond).toBe(false);
			expect(read.rows[0]?.holds_block).toBe(true);
			// The shared edge, pinned rather than left unread. A change that made the
			// pieces disjoint would be a real change and should fail here first.
			expect(read.rows[0]?.valid).toBe(false);
		});
	});

	/**
	 * The optimistic centroid against the one the trigger will write.
	 *
	 * `ownedCentroidFromGeoJson` is what the browser puts in the optimistic row
	 * and `st_centroid` is what `set_owned_centroid()` writes when Electric
	 * confirms it, so a disagreement is a marker that jumps. A unit test with
	 * hand-computed numbers would only prove the implementation matches whoever
	 * wrote the test; the thing that has to be true is that it matches PostGIS.
	 *
	 * The geometries are the region-membership corpus, which is a set of shapes
	 * somebody already chose for their awkwardness: holes, parts sharing an edge,
	 * a part in a hole, a small part far from a big one. All six shapes go
	 * through, areal and linear alike.
	 *
	 * `LINEAR_EDGE_CASES` carries what the corpus has no reason to hold: uneven
	 * vertex spacing, which is the whole of the difference between a length
	 * weighting and an average, and lines with no length, where the weighting has
	 * nothing to divide by.
	 */
	it('puts the optimistic centroid where st_centroid does', async () => {
		await withTestDb(async ({ db }) => {
			const geometries: readonly (readonly [string, GeoJsonGeometry])[] = [
				...REGION_MEMBERSHIP_CORPUS.map(
					(corpusCase) => [corpusCase.id, corpusCase.record] as const,
				),
				...[...new Set(REGION_MEMBERSHIP_CORPUS.map(corpusRegionFor))].map(
					(region, index) => [`region-${index}`, region] as const,
				),
				...LINEAR_EDGE_CASES,
			];

			const rows = await sql<{ id: string; lng: number; lat: number }>`
				select
					source.id,
					st_x(st_centroid(st_geomfromgeojson(source.geojson))) as lng,
					st_y(st_centroid(st_geomfromgeojson(source.geojson))) as lat
				from (
					select * from unnest(
						${geometries.map(([id]) => id)}::text[],
						${geometries.map(([, geometry]) => JSON.stringify(geometry))}::text[]
					) as t(id, geojson)
				) source
			`.execute(db);

			expect(rows.rows).toHaveLength(geometries.length);
			for (const row of rows.rows) {
				const geometry = geometries.find(([id]) => id === row.id)?.[1];
				const optimistic = geometry === undefined ? null : ownedCentroidFromGeoJson(geometry);

				expect(optimistic?.lng, row.id).toBeCloseTo(row.lng, 9);
				expect(optimistic?.lat, row.id).toBeCloseTo(row.lat, 9);
			}
		});
	});
});

/** What each `geom` column will accept, read from the catalog. */
async function readStorableShapes(
	db: Kysely<SimmerDatabase>,
	schemaName: string,
): Promise<Map<string, ReadonlySet<string>>> {
	const columns = await sql<{ table_name: string; typmod_type: string | null }>`
		select r.relname as table_name, postgis_typmod_type(a.atttypmod) as typmod_type
		from pg_attribute a
		join pg_class r on r.oid = a.attrelid
		join pg_namespace n on n.oid = r.relnamespace
		where n.nspname = ${schemaName}
			and a.attname = 'geom'
			and not a.attisdropped
			and r.relkind = 'r'
	`.execute(db);

	const constraints = await sql<{ table_name: string; definition: string }>`
		select r.relname as table_name, pg_get_constraintdef(c.oid) as definition
		from pg_constraint c
		join pg_class r on r.oid = c.conrelid
		join pg_namespace n on n.oid = r.relnamespace
		where n.nspname = ${schemaName} and c.contype = 'c'
	`.execute(db);

	const accepted = new Map<string, Set<string>>();
	for (const row of constraints.rows) {
		if (!/geometrytype\s*\(/i.test(row.definition)) {
			continue;
		}
		const named = shapesNamedIn(row.definition);
		const existing = accepted.get(row.table_name);
		accepted.set(
			row.table_name,
			existing === undefined ? named : new Set([...existing].filter((name) => named.has(name))),
		);
	}

	const storable = new Map<string, ReadonlySet<string>>();
	for (const row of columns.rows) {
		const byTypmod = shapesNamedIn(row.typmod_type ?? '');
		const byCheck = accepted.get(row.table_name);
		const shapes = (byTypmod.size === 0 ? EVERY_SHAPE : [...byTypmod]).filter(
			(name) => byCheck === undefined || byCheck.has(name),
		);
		storable.set(row.table_name, new Set(shapes));
	}
	return storable;
}

/** The shapes a fragment of DDL names, whatever its case or quoting. */
function shapesNamedIn(text: string): Set<string> {
	const named = new Set<string>();
	for (const [upper, shape] of Object.entries(SHAPE_BY_UPPER_NAME)) {
		if (new RegExp(`\\b${upper}\\b`, 'i').test(text)) {
			named.add(shape);
		}
	}
	return named;
}
