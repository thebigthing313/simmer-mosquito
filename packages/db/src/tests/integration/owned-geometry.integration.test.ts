import { OWNED_GEOMETRY_POLICIES } from '@simmer-mosquito/domain';
import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { corpusRegionFor, REGION_MEMBERSHIP_CORPUS } from '@simmer-mosquito/mapping/test-corpus';
import type { Kysely } from 'kysely';
import { expect, it } from 'vitest';
import {
	createAddress,
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

/** The two shapes whose centroid PostGIS weights by length and the client does not. */
const LINEAR: ReadonlySet<string> = new Set(['LineString', 'MultiLineString']);

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
	 * a part in a hole, a small part far from a big one.
	 *
	 * Lines are excluded, and that is the documented drift rather than an
	 * oversight. `st_centroid` weights a line by segment length and the client
	 * averages vertices, so the two answer differently for any line with uneven
	 * spacing. ADR 0018 keeps the average for points and lines; only the areal
	 * half moved.
	 */
	it('puts the optimistic areal centroid where st_centroid does', async () => {
		await withTestDb(async ({ db }) => {
			const geometries: readonly (readonly [string, GeoJsonGeometry])[] = [
				...REGION_MEMBERSHIP_CORPUS.map(
					(corpusCase) => [corpusCase.id, corpusCase.record] as const,
				),
				...[...new Set(REGION_MEMBERSHIP_CORPUS.map(corpusRegionFor))].map(
					(region, index) => [`region-${index}`, region] as const,
				),
			].filter(([, geometry]) => !LINEAR.has(geometry.type));

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
