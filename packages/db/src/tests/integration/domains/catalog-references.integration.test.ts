import { expect, it } from 'vitest';
import {
	assertCatalogReferences,
	CatalogReferenceRefusedError,
	type Kysely,
	type SimmerDatabase,
	sql,
} from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';

/**
 * The forward half of the delete registry's question, against real tables.
 *
 * Three of these could not be asked without Postgres. A foreign key is
 * satisfied by the row existing anywhere, so "belongs to another agency" and
 * "is soft-deleted" both compile and both insert; only a query knows. The
 * fourth, the unchanged-value case on an update, is the one a writer breaks by
 * gating on the payload id without reading what is stored, and it stays
 * invisible until something is deactivated.
 */
describeDbIntegration('catalog reference gate', () => {
	it('allows a live, active row of the writing agency', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'gate_allow');
			const methodId = await createCollectionMethod(db, org, true);

			await expect(
				assertCatalogReferences(db, {
					organizationId: org,
					references: [reference(methodId)],
				}),
			).resolves.toBeUndefined();
		});
	});

	it('refuses an inactive row, and says so rather than calling it missing', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'gate_inactive');
			const methodId = await createCollectionMethod(db, org, false);

			const refusal = await capture(db, org, methodId);
			expect(refusal?.reason).toBe('inactive');
			expect(refusal?.catalog).toBe('collectionMethod');
		});
	});

	it('refuses a soft-deleted row and another agency’s row alike', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await createOrganization(db, 'gate_mine');
			const theirs = await createOrganization(db, 'gate_theirs');

			const deleted = await createCollectionMethod(db, mine, true);
			await db
				.updateTable('collection_methods')
				.set({ deleted_at: sql`now()` })
				.where('id', '=', deleted)
				.execute();
			const otherAgency = await createCollectionMethod(db, theirs, true);

			// The two answer alike on purpose: a refusal that told them apart would
			// be a way to probe for another agency's ids.
			expect((await capture(db, mine, deleted))?.reason).toBe('missing');
			expect((await capture(db, mine, otherAgency))?.reason).toBe('missing');
		});
	});

	it('refuses nothing when the reference is unchanged on an update', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'gate_unchanged');
			const methodId = await createCollectionMethod(db, org, true);
			const trapId = await createTrap(db, org, methodId);

			await db
				.updateTable('collection_methods')
				.set({ is_active: false })
				.where('id', '=', methodId)
				.execute();

			// The trap already names this method. Correcting its name must not be
			// refused because the method retired afterwards.
			await expect(
				assertCatalogReferences(db, {
					organizationId: org,
					table: 'traps',
					recordId: trapId,
					references: [reference(methodId)],
				}),
			).resolves.toBeUndefined();
		});
	});

	it('refuses a changed reference on an update', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'gate_changed');
			const current = await createCollectionMethod(db, org, true, 'CDC light trap');
			const retired = await createCollectionMethod(db, org, false, 'Gravid trap');
			const trapId = await createTrap(db, org, current);

			await expect(
				assertCatalogReferences(db, {
					organizationId: org,
					table: 'traps',
					recordId: trapId,
					references: [reference(retired)],
				}),
			).rejects.toBeInstanceOf(CatalogReferenceRefusedError);
		});
	});

	it('ignores a reference being cleared', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createOrganization(db, 'gate_cleared');

			await expect(
				assertCatalogReferences(db, {
					organizationId: org,
					references: [{ ...reference(''), id: null }],
				}),
			).resolves.toBeUndefined();
		});
	});
});

type Db = Kysely<SimmerDatabase>;

function reference(id: string) {
	return {
		column: 'collection_method_id',
		catalog: 'collectionMethod',
		id,
		label: 'collection method',
	} as const;
}

/** The refusal, or null when the gate allowed the write. */
async function capture(
	db: Db,
	organizationId: string,
	id: string,
): Promise<CatalogReferenceRefusedError | null> {
	try {
		await assertCatalogReferences(db, { organizationId, references: [reference(id)] });
		return null;
	} catch (error) {
		if (error instanceof CatalogReferenceRefusedError) {
			return error;
		}
		throw error;
	}
}

async function createOrganization(db: Db, slug: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/** `name` is unique per agency, so each row in a test needs its own. */
async function createCollectionMethod(
	db: Db,
	organizationId: string,
	isActive: boolean,
	name = 'CDC light trap',
): Promise<string> {
	const row = await db
		.insertInto('collection_methods')
		.values({ organization_id: organizationId, name, is_active: isActive })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function createTrap(
	db: Db,
	organizationId: string,
	collectionMethodId: string,
): Promise<string> {
	const row = await db
		.insertInto('traps')
		.values({
			organization_id: organizationId,
			collection_method_id: collectionMethodId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			trap_name: 'North gate',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
