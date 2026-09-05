import { expect, it } from 'vitest';
import { type Kysely, type SimmerDatabase, searchDocuments, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

/**
 * No test here asserts a score, and none asserts a position that a threshold
 * change would move. "This query puts `TRP-001` in `exact` and `TRP-0012` in
 * `prefix`" survives a tuning change; "these ids in this order" does not, and
 * would be re-baselined to green the first time it broke.
 *
 * The one literal assertion is determinism: the same query twice returns the
 * same order. That is the whole reason the tie-break names `source_table` and
 * then `source_id`.
 */
describeDbIntegration('search documents reader', () => {
	it('assigns one class per document, best class first', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_classes');

			await seedTrap(db, org, 'TRP-001', 'Roadside gravid trap');
			await seedTrap(db, org, 'TRP-0012', 'Second trap on the same run');
			await seedTrap(db, org, 'Milstone River', null);

			const result = await searchDocuments(db, {
				organizationId: org,
				query: 'TRP-001',
				limit: 20,
				offset: 0,
			});

			expect(classOf(result.rows, 'trap_name', 'TRP-001')).toBe('exact');
			expect(classOf(result.rows, 'trap_name', 'TRP-0012')).toBe('prefix');
		});
	});

	// The measured failure #274 found: with the identifier fields joined into one
	// string, an equality match can only fire on a document holding exactly one of
	// them, which was 32% of the record corpus.
	it('reaches an exact match on any identifier field, not only the first', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_exact');

			await db
				.insertInto('contacts')
				.values({
					organization_id: org,
					contact_name: 'Radhika Patel',
					email: 'radhi19@gmail.com',
					preferred_phone: '+18605813196',
				})
				.execute();

			const result = await searchDocuments(db, {
				organizationId: org,
				query: 'radhi19@gmail.com',
				limit: 20,
				offset: 0,
			});

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]?.matchClass).toBe('exact');
			// The matched field is what makes a contact's email visible as the reason
			// the row appeared, so it has to name the field that produced the class
			// and not just the first field present.
			expect(result.rows[0]?.matchedField).toBe('email');
		});
	});

	// At three characters and up the prefix branch is preceded by a trigram
	// containment test, which the index serves and which is a superset of the
	// per-field prefix. A field that is not the first declared one is where a
	// pre-filter that was not a superset would show up.
	it('reaches a prefix on a later identifier field, above the trigram floor', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_prefix');

			await db
				.insertInto('contacts')
				.values({
					organization_id: org,
					contact_name: 'Radhika Patel',
					company: 'Township Public Works',
				})
				.execute();

			const result = await searchDocuments(db, {
				organizationId: org,
				query: 'Township',
				limit: 20,
				offset: 0,
			});

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]?.matchClass).toBe('prefix');
			expect(result.rows[0]?.matchedField).toBe('company');
		});
	});

	it('finds a typo through the fuzzy class and names the field it matched', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_fuzzy');
			await seedRegion(db, org, 'Dunellen');

			const result = await searchDocuments(db, {
				organizationId: org,
				query: 'Dunelen',
				limit: 20,
				offset: 0,
			});

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]?.matchClass).toBe('fuzzy');
			expect(result.rows[0]?.matchedField).toBe('name');
		});
	});

	// A comment has no identifier field, so it is reachable by full text alone and
	// can only ever land in the weakest class.
	it('reaches a comment by its text and carries its target in display', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_comments');
			const habitat = await seedHabitat(db, org, 'MID - S2 - 139', '');

			await db
				.insertInto('comments')
				.values({
					organization_id: org,
					entity_type: 'habitat',
					entity_id: habitat,
					comment_text: 'Wyoming Avenue outfall was dry today',
				})
				.execute();

			const result = await searchDocuments(db, {
				organizationId: org,
				query: 'outfall',
				limit: 20,
				offset: 0,
			});

			expect(result.rows).toHaveLength(1);
			expect(result.rows[0]?.sourceTable).toBe('comments');
			expect(result.rows[0]?.matchClass).toBe('text');
			expect(result.rows[0]?.display.entity_type).toBe('habitat');
			expect(result.rows[0]?.display.entity_id).toBe(habitat);
		});
	});

	// Below three characters only `fuzzy` is off. `to_tsquery('a:*')` is served by
	// the GIN index at any length, so a two-letter query can still reach a comment.
	it('runs exact, prefix and text below the fuzzy floor', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_short');
			await seedRegion(db, org, 'Ea');
			await seedRegion(db, org, 'Eastern Marsh');

			const result = await searchDocuments(db, {
				organizationId: org,
				query: 'Ea',
				limit: 20,
				offset: 0,
			});

			expect(classOf(result.rows, 'name', 'Ea')).toBe('exact');
			expect(classOf(result.rows, 'name', 'Eastern Marsh')).toBe('prefix');
		});
	});

	it('counts records and comments exactly, and never narrows counts by the filter', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_counts');
			const habitat = await seedHabitat(db, org, 'Elm Ditch', 'elm lined culvert');
			await seedRegion(db, org, 'Elm Township');

			for (const text of ['elm was clear', 'elm needed treatment']) {
				await db
					.insertInto('comments')
					.values({
						organization_id: org,
						entity_type: 'habitat',
						entity_id: habitat,
						comment_text: text,
					})
					.execute();
			}

			const everything = await searchDocuments(db, {
				organizationId: org,
				query: 'elm',
				limit: 20,
				offset: 0,
			});
			expect(everything.counts).toEqual({ records: 2, comments: 2 });
			expect(everything.total).toBe(4);

			const commentsOnly = await searchDocuments(db, {
				organizationId: org,
				query: 'elm',
				limit: 20,
				offset: 0,
				documentClass: 'comments',
			});
			expect(commentsOnly.total).toBe(2);
			// The rail has to be able to show what the other row holds, so the filter
			// narrows `total` and leaves `counts` alone.
			expect(commentsOnly.counts).toEqual({ records: 2, comments: 2 });
			expect(commentsOnly.rows.every((row) => row.sourceTable === 'comments')).toBe(true);
		});
	});

	it('walks a stable list by offset and returns the same order twice', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_paging');
			for (let index = 0; index < 6; index += 1) {
				await seedRegion(db, org, `Marsh sector ${index}`);
			}

			const all = await searchDocuments(db, {
				organizationId: org,
				query: 'marsh',
				limit: 10,
				offset: 0,
			});
			expect(all.rows).toHaveLength(6);

			const again = await searchDocuments(db, {
				organizationId: org,
				query: 'marsh',
				limit: 10,
				offset: 0,
			});
			expect(again.rows.map((row) => row.sourceId)).toEqual(all.rows.map((row) => row.sourceId));

			const secondPage = await searchDocuments(db, {
				organizationId: org,
				query: 'marsh',
				limit: 2,
				offset: 4,
			});
			expect(secondPage.rows.map((row) => row.sourceId)).toEqual(
				all.rows.slice(4, 6).map((row) => row.sourceId),
			);
			expect(secondPage.total).toBe(6);
		});
	});

	it('holds one agency to its own documents', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await seedOrganization(db, 'workos_org_search_mine');
			const theirs = await seedOrganization(db, 'workos_org_search_theirs');
			await seedRegion(db, mine, 'Shared Name');
			await seedRegion(db, theirs, 'Shared Name');

			const result = await searchDocuments(db, {
				organizationId: mine,
				query: 'Shared Name',
				limit: 20,
				offset: 0,
			});

			expect(result.rows).toHaveLength(1);
			expect(result.total).toBe(1);
		});
	});

	// A soft delete deletes the document. The record still exists and can be
	// restored, so this also covers the re-insert on the way back.
	it('drops a soft-deleted record and restores it when the delete is cleared', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_deleted');
			const region = await seedRegion(db, org, 'Vanishing Marsh');

			await db
				.updateTable('regions')
				.set({ deleted_at: new Date() })
				.where('id', '=', region)
				.execute();
			const gone = await searchDocuments(db, {
				organizationId: org,
				query: 'Vanishing Marsh',
				limit: 20,
				offset: 0,
			});
			expect(gone.rows).toHaveLength(0);

			await db.updateTable('regions').set({ deleted_at: null }).where('id', '=', region).execute();
			const back = await searchDocuments(db, {
				organizationId: org,
				query: 'Vanishing Marsh',
				limit: 20,
				offset: 0,
			});
			expect(back.rows).toHaveLength(1);
		});
	});

	// The three corpus tables with a lifecycle, and the ten without. `display` is
	// not indexed, so nothing here can move a rank.
	it('carries the lifecycle state of the three tables that have one, and no other', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_lifecycle');

			await seedHabitat(db, org, 'Cedar Slough', 'Roadside ditch');
			await seedTrap(db, org, 'Cedar Slough trap', null);
			await seedWeatherSource(db, org, 'Cedar Slough station', 'CDR-1');
			await seedRegion(db, org, 'Cedar Slough district');

			const result = await searchDocuments(db, {
				organizationId: org,
				query: 'Cedar Slough',
				limit: 20,
				offset: 0,
			});

			expect(displayOf(result.rows, 'habitats')).toEqual({ is_active: 'true' });
			expect(displayOf(result.rows, 'traps')).toEqual({ is_active: 'true' });
			expect(displayOf(result.rows, 'weather_sources')).toEqual({ is_active: 'true' });
			expect(displayOf(result.rows, 'regions')).toEqual({});
		});
	});

	it('keeps a retired record in the corpus and in the class it already matched', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_retired');
			const habitat = await seedHabitat(db, org, 'Mill Pond', 'Behind the old mill');

			const before = await searchDocuments(db, {
				organizationId: org,
				query: 'Mill Pond',
				limit: 20,
				offset: 0,
			});

			await db
				.updateTable('habitats')
				.set({ is_active: false })
				.where('id', '=', habitat)
				.execute();

			const after = await searchDocuments(db, {
				organizationId: org,
				query: 'Mill Pond',
				limit: 20,
				offset: 0,
			});

			expect(after.rows).toHaveLength(1);
			expect(after.total).toBe(before.total);
			expect(after.rows[0]?.matchClass).toBe(before.rows[0]?.matchClass);
			expect(after.rows[0]?.matchedField).toBe(before.rows[0]?.matchedField);
			expect(after.rows[0]?.fields).toEqual(before.rows[0]?.fields);
			expect(after.rows[0]?.display).toEqual({ is_active: 'false' });
		});
	});

	/*
	 * The failure this migration can ship green: correct for every row written
	 * after it, stale for every row written before.
	 *
	 * So the rows are seeded against the schema as it stood *before* the
	 * migration, which is what `pauseBefore` buys. Seeding afterwards would
	 * exercise the projection and never the backfill, and would pass whether or
	 * not the backfill exists.
	 */
	it('rewrites the documents of rows that predate the migration, and tracks them after', async () => {
		await withTestDb(
			async ({ db, applyHeldBackMigrations }) => {
				const org = await seedOrganization(db, 'workos_org_search_backfill');
				const habitat = await seedHabitat(db, org, 'Otter Creek', 'Culvert at the bend');
				const trap = await seedTrap(db, org, 'Otter Creek trap', null);
				const station = await seedWeatherSource(db, org, 'Otter Creek station', 'OTR-1');

				const stale = await searchDocuments(db, {
					organizationId: org,
					query: 'Otter Creek',
					limit: 20,
					offset: 0,
				});
				expect(displayOf(stale.rows, 'habitats')).toEqual({});

				await applyHeldBackMigrations();

				const backfilled = await searchDocuments(db, {
					organizationId: org,
					query: 'Otter Creek',
					limit: 20,
					offset: 0,
				});
				expect(displayOf(backfilled.rows, 'habitats')).toEqual({ is_active: 'true' });
				expect(displayOf(backfilled.rows, 'traps')).toEqual({ is_active: 'true' });
				expect(displayOf(backfilled.rows, 'weather_sources')).toEqual({ is_active: 'true' });

				// The trigger gate now names `is_active`, so retiring one of these
				// pre-existing rows rewrites its document rather than leaving it.
				await db
					.updateTable('habitats')
					.set({ is_active: false })
					.where('id', '=', habitat)
					.execute();
				await db.updateTable('traps').set({ is_active: false }).where('id', '=', trap).execute();
				await db
					.updateTable('weather_sources')
					.set({ is_active: false })
					.where('id', '=', station)
					.execute();

				const retired = await searchDocuments(db, {
					organizationId: org,
					query: 'Otter Creek',
					limit: 20,
					offset: 0,
				});
				expect(displayOf(retired.rows, 'habitats')).toEqual({ is_active: 'false' });
				expect(displayOf(retired.rows, 'traps')).toEqual({ is_active: 'false' });
				expect(displayOf(retired.rows, 'weather_sources')).toEqual({ is_active: 'false' });

				await db
					.updateTable('habitats')
					.set({ is_active: true })
					.where('id', '=', habitat)
					.execute();

				const reactivated = await searchDocuments(db, {
					organizationId: org,
					query: 'Otter Creek',
					limit: 20,
					offset: 0,
				});
				expect(displayOf(reactivated.rows, 'habitats')).toEqual({ is_active: 'true' });
			},
			{ pauseBefore: '202608300001_search_document_lifecycle.sql' },
		);
	});

	/*
	 * `weather_sources` is the one corpus table whose tenancy column is nullable,
	 * and the one place the migration deliberately leaves a corpus row out of the
	 * index. A null `organization_id` is a platform-owned station, which is
	 * nobody's agency record.
	 *
	 * #279 settled that it stays out once provider stations land: an Organization
	 * will see only the stations it has subscribed to through
	 * `weather_source_subscriptions`, so an unsubscribed station has no
	 * Organization to be indexed under. Whoever builds that feed owes the index
	 * one document per subscribing Organization, and this test is what they trip
	 * over.
	 *
	 * The reader takes an `organizationId`, so it cannot tell "no document" from
	 * "a document the tenancy filter dropped". Both directions are read off
	 * `search_documents` itself.
	 */
	it('indexes an agency station and leaves a platform-owned one out', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_platform_station');
			const owned = await seedWeatherSource(db, org, 'Cedar Bend station', 'CDB-1');
			const platform = await seedWeatherSource(db, null, 'Cedar Bend NWS', 'KCDB');

			expect(await documentsFor(db, 'weather_sources', owned)).toBe(1);
			expect(await documentsFor(db, 'weather_sources', platform)).toBe(0);

			// The platform station is a real row, and its shape scope streams it to
			// every Organization. Search is what excludes it, not the row failing to
			// exist.
			const stations = await db
				.selectFrom('weather_sources')
				.select(['id'])
				.where('source_name', 'like', 'Cedar Bend%')
				.execute();
			expect(stations).toHaveLength(2);
		});
	});

	// `to_tsquery` raises syntax errors rather than swallowing them, which is why
	// every token goes through `quote_literal`. Without that these 500.
	it('takes operator characters and apostrophes as literal text', async () => {
		await withTestDb(async ({ db }) => {
			const org = await seedOrganization(db, 'workos_org_search_syntax');
			await seedRegion(db, org, "O'Brien Tract");

			// The backslash is the one `quote_literal` treats differently, which is
			// why building the tsquery in SQL out of it was wrong.
			for (const query of ["O'Brien", '& | !', ':*', 'a & b', 'a\\b', '\\', "''"]) {
				const result = await searchDocuments(db, {
					organizationId: org,
					query,
					limit: 20,
					offset: 0,
				});
				expect(Array.isArray(result.rows)).toBe(true);
			}

			const found = await searchDocuments(db, {
				organizationId: org,
				query: "O'Brien",
				limit: 20,
				offset: 0,
			});
			expect(found.rows).toHaveLength(1);
		});
	});
});

/**
 * Index rows for one corpus row. `search_documents` is derived and is not in the
 * Kysely types, so this is raw SQL.
 */
async function documentsFor(
	db: Kysely<SimmerDatabase>,
	sourceTable: string,
	sourceId: string,
): Promise<number> {
	const result = await sql<{ documents: string }>`
		select count(*)::text as documents from search_documents
		where source_table = ${sourceTable} and source_id = ${sourceId}::uuid
	`.execute(db);
	return Number(result.rows[0]?.documents ?? '0');
}

function classOf(
	rows: readonly { readonly fields: Record<string, string>; readonly matchClass: string }[],
	field: string,
	value: string,
): string | undefined {
	return rows.find((row) => row.fields[field] === value)?.matchClass;
}

/** The display payload of the one row from `table`, which is where lifecycle rides. */
function displayOf(
	rows: readonly { readonly sourceTable: string; readonly display: Record<string, string> }[],
	table: string,
): Record<string, string> | undefined {
	return rows.find((row) => row.sourceTable === table)?.display;
}

async function seedOrganization(db: Kysely<SimmerDatabase>, workosId: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: workosId, name: 'Search District' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function seedHabitat(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	name: string,
	description: string,
): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			habitat_name: name,
			description,
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function seedTrap(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	name: string,
	description: string | null,
): Promise<string> {
	const method = await db
		.insertInto('collection_methods')
		.values({ organization_id: organizationId, name: `Gravid trap for ${name}` })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const row = await db
		.insertInto('traps')
		.values({
			organization_id: organizationId,
			collection_method_id: method.id,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			trap_name: name,
			description: description ?? '',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/** A null `organizationId` seeds a platform-owned station, which no product surface writes. */
async function seedWeatherSource(
	db: Kysely<SimmerDatabase>,
	organizationId: string | null,
	name: string,
	code: string,
): Promise<string> {
	const row = await db
		.insertInto('weather_sources')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			source_type: organizationId === null ? 'nws' : 'organization',
			source_name: name,
			source_code: code,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function seedRegion(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
	name: string,
): Promise<string> {
	const row = await db
		.insertInto('regions')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_geomfromtext('POLYGON((-90.6 35.4, -90.4 35.4, -90.4 35.6, -90.6 35.6, -90.6 35.4))'), 4326)`,
			name,
			description: '',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
