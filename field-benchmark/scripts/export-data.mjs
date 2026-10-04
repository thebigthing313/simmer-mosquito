// Exports the benchmark's data bundle from the local prod clone.
// Writes data/bundle/<table>.json (plus .json.gz for the LAN server) and
// data/bundle/manifest.json. The bundle holds customer data: data/ is ignored
// by git and must never be committed or uploaded anywhere public.
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import pg from 'pg'

const url = process.env.BENCH_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/simmer_mosquito'
const client = new pg.Client({ connectionString: url })
await client.connect()

const { rows: orgRows } = await client.query(
	`select organization_id, count(*)::int as n from habitats where deleted_at is null group by 1 order by 2 desc limit 1`,
)
const organizationId = process.env.BENCH_ORGANIZATION_ID ?? orgRows[0].organization_id

// A synced row is the table's columns less what no client receives, plus the
// GeoJSON column the mobile shapes carry (decided in #1336).
const rowSql = (table, geojsonExpr) => `
	select (to_jsonb(t) - 'geom' - 'deleted_at' - 'deleted_by_profile_id' - 'geojson')
		|| jsonb_build_object('geojson', ${geojsonExpr}) as row
	from ${table} t
	where t.deleted_at is null and t.organization_id = $1`

const tables = {
	habitats: rowSql('habitats', `st_asgeojson(t.geom, 7)::jsonb`),
	addresses: rowSql('addresses', `st_asgeojson(t.geom, 7)::jsonb`),
	traps: rowSql('traps', `st_asgeojson(t.geom, 7)::jsonb`),
	// Regions simplified to about 5 m, as #1336 settled.
	regions: rowSql(
		'regions',
		`st_asgeojson(st_transform(st_simplifypreservetopology(st_transform(t.geom, 32618), 5), 4326), 7)::jsonb`,
	),
	routes: `select (to_jsonb(t) - 'deleted_at' - 'deleted_by_profile_id') as row from routes t where t.deleted_at is null and t.organization_id = $1`,
	route_items: `select (to_jsonb(t) - 'deleted_at' - 'deleted_by_profile_id') as row from route_items t where t.deleted_at is null and t.organization_id = $1`,
}

const outDir = new URL('../data/bundle/', import.meta.url)
mkdirSync(outDir, { recursive: true })
const manifest = { organizationId, exportedAt: new Date().toISOString(), tables: {} }
for (const [table, sql] of Object.entries(tables)) {
	const { rows } = await client.query(sql, [organizationId])
	const json = JSON.stringify(rows.map((r) => r.row))
	const gz = gzipSync(json, { level: 6 })
	writeFileSync(new URL(`${table}.json`, outDir), json)
	writeFileSync(new URL(`${table}.json.gz`, outDir), gz)
	manifest.tables[table] = { rows: rows.length, bytes: json.length, gzipBytes: gz.length }
	console.log(`${table.padEnd(12)} ${String(rows.length).padStart(6)} rows  ${(json.length / 1e6).toFixed(1)} MB  gz ${(gz.length / 1e6).toFixed(1)} MB`)
}

// The basemap box: Regions, habitats and traps plus 1 km, addresses left out (#1359).
const { rows: box } = await client.query(
	`with g as (
		select geom from regions where deleted_at is null and organization_id = $1
		union all select geom from habitats where deleted_at is null and organization_id = $1
		union all select geom from traps where deleted_at is null and organization_id = $1
	), b as (select st_transform(st_setsrid(st_expand(st_extent(st_transform(geom, 32618)), 1000), 32618), 4326) as e from g)
	select st_xmin(e) w, st_ymin(e) s, st_xmax(e) e2, st_ymax(e) n from b`,
	[organizationId],
)
manifest.basemapBox = [box[0].w, box[0].s, box[0].e2, box[0].n]
writeFileSync(new URL('manifest.json', outDir), JSON.stringify(manifest, null, 2))
console.log('box', manifest.basemapBox.map((v) => v.toFixed(5)).join(','))
await client.end()
