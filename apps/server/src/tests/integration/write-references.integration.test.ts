import { type Kysely, ReferenceRefusedError, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import { describeDbIntegration, withTestDb } from '@simmer-mosquito/db/test-support';
import {
	createTrapCommand,
	recordAdHocInspectionCommand,
	updateTrapConfigurationCommand,
} from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import { writeTrapCommand } from '../../adult-surveillance-commands/traps.js';
import { writeInspectionCommand } from '../../larval-surveillance-commands/inspections.js';

/**
 * A write may not name another agency's record (#200).
 *
 * The agency a write lands in comes from the session, so a new row is never
 * mis-filed. The ids it *refers* to came off the payload, and the only thing
 * behind them was the Postgres foreign key, which is satisfied by the row
 * existing anywhere. Org A could create a Trap standing at org B's Address and
 * get a 201.
 *
 * These run against Postgres because the claim is a query's. A fake transaction
 * would show the gate being called; only a real database shows that the
 * predicate finds nothing across agencies and that no row is left behind when
 * it refuses.
 *
 * Two writers rather than thirty, chosen for the two seams every writer reaches
 * the gate through: an insert wrapped in `checkedValues` and an update through
 * `updateRow`. That every other writer uses one of the two is
 * `pnpm check:write-references`'s claim, made statically over the whole tree,
 * which is a stronger reading than thirty near-identical fixtures would be.
 */
describeDbIntegration('cross-agency references', () => {
	it('refuses a create naming another agency’s address, and writes nothing', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await seedOrganization(db, 'refs_create_mine');
			const theirs = await seedOrganization(db, 'refs_create_theirs');
			const theirAddress = await createAddress(db, theirs.organizationId);
			const trapId = crypto.randomUUID();

			const command = createTrapCommand({
				organizationId: mine.organizationId,
				actorProfileId: mine.profileId,
				trapId,
				collectionMethodId: mine.collectionMethodId,
				addressId: theirAddress,
				trapName: 'North gate',
				locationSource: { kind: 'geometry', geometry: POINT },
			});

			await expect(
				db.transaction().execute((trx) => writeTrapCommand(trx, command)),
			).rejects.toBeInstanceOf(ReferenceRefusedError);

			// The refusal is inside the transaction, so the trap has to be gone as
			// well as refused. A gate that threw after its insert would still read
			// as a refusal to the caller.
			const written = await db
				.selectFrom('traps')
				.select(['id'])
				.where('id', '=', trapId)
				.executeTakeFirst();
			expect(written).toBeUndefined();
		});
	});

	it('names the address in the refusal rather than saying which agency owns it', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await seedOrganization(db, 'refs_reason_mine');
			const theirs = await seedOrganization(db, 'refs_reason_theirs');
			const theirAddress = await createAddress(db, theirs.organizationId);

			const refusal = await capture(() =>
				writeTrapCommandFor(db, mine, { addressId: theirAddress }),
			);

			expect(refusal?.reference).toBe('addresses');
			// `missing`, not `elsewhere`: telling "another agency's" apart from "no
			// such row" would make the refusal a way to probe for ids.
			expect(refusal?.reason).toBe('missing');
			expect(refusal?.message).toBe('That address is not available.');
		});
	});

	it('refuses an update that repoints a record at another agency’s address', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await seedOrganization(db, 'refs_update_mine');
			const theirs = await seedOrganization(db, 'refs_update_theirs');
			const ourAddress = await createAddress(db, mine.organizationId);
			const theirAddress = await createAddress(db, theirs.organizationId);

			const trap = await writeTrapCommandFor(db, mine, { addressId: ourAddress });
			const trapId = trap?.id ?? '';

			const command = updateTrapConfigurationCommand({
				organizationId: mine.organizationId,
				actorProfileId: mine.profileId,
				trapId,
				addressId: theirAddress,
			});

			await expect(
				db.transaction().execute((trx) => writeTrapCommand(trx, command)),
			).rejects.toBeInstanceOf(ReferenceRefusedError);

			const stored = await db
				.selectFrom('traps')
				.select(['address_id'])
				.where('id', '=', trapId)
				.executeTakeFirstOrThrow();
			expect(stored.address_id).toBe(ourAddress);
		});
	});

	it('refuses a create naming another agency’s profile as the inspector', async () => {
		await withTestDb(async ({ db }) => {
			const mine = await seedOrganization(db, 'refs_profile_mine');
			const theirs = await seedOrganization(db, 'refs_profile_theirs');

			// A Profile rather than an Address, because a profile id is the one an
			// operator moving between agencies is most likely to still be holding.
			const command = recordAdHocInspectionCommand({
				organizationId: mine.organizationId,
				actorProfileId: mine.profileId,
				inspectionId: crypto.randomUUID(),
				inspectionDate: '2026-08-21',
				inspectedByProfileId: theirs.profileId,
				locationSource: { kind: 'geometry', geometry: POINT },
				isWet: false,
			});

			const refusal = await capture(() =>
				db.transaction().execute((trx) => writeInspectionCommand(trx, command)),
			);
			expect(refusal?.reference).toBe('profiles');
			expect(refusal?.message).toBe('That inspector is not available.');
		});
	});
});

type Db = Kysely<SimmerDatabase>;

const POINT = { type: 'Point', coordinates: [-90.5, 35.5] } as const;

interface SeededOrganization {
	readonly organizationId: string;
	readonly profileId: string;
	readonly collectionMethodId: string;
}

async function seedOrganization(db: Db, slug: string): Promise<SeededOrganization> {
	const organization = await db
		.insertInto('organizations')
		.values({ workos_organization_id: `workos_${slug}`, name: `${slug} District` })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const profile = await db
		.insertInto('profiles')
		.values({ organization_id: organization.id, display_name: 'Field tech' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const method = await db
		.insertInto('collection_methods')
		.values({ organization_id: organization.id, name: 'CDC light trap', is_active: true })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	return {
		organizationId: organization.id,
		profileId: profile.id,
		collectionMethodId: method.id,
	};
}

async function createAddress(db: Db, organizationId: string): Promise<string> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
			display_name: '14 Levee Road',
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

function writeTrapCommandFor(
	db: Db,
	actor: SeededOrganization,
	input: { readonly addressId: string },
) {
	const command = createTrapCommand({
		organizationId: actor.organizationId,
		actorProfileId: actor.profileId,
		trapId: crypto.randomUUID(),
		collectionMethodId: actor.collectionMethodId,
		addressId: input.addressId,
		trapName: 'North gate',
		locationSource: { kind: 'geometry', geometry: POINT },
	});
	return db.transaction().execute((trx) => writeTrapCommand(trx, command));
}

/** The refusal, or null when the write was allowed. */
async function capture(write: () => Promise<unknown>): Promise<ReferenceRefusedError | null> {
	try {
		await write();
		return null;
	} catch (error) {
		if (error instanceof ReferenceRefusedError) {
			return error;
		}
		throw error;
	}
}
