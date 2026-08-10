import { expect, it } from 'vitest';
import { roleLadderIds, roleLadderPeople, seedRoleLadder } from '../../seeds/role-ladder.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

/**
 * The role-ladder fixtures, seeded into real tables.
 *
 * A seed script is only worth having if it still works, and this one is meant
 * to be run repeatedly against a shared staging database — so what matters is
 * that it applies at all against the live constraints, that the rows land in
 * the states the manual checklist depends on, and that running it twice does
 * not duplicate or drift.
 */
describeDbIntegration('role ladder fixtures', () => {
	it('seeds one membership per rung, with the ladder’s roles', async () => {
		await withTestDb(async ({ db }) => {
			await seedRoleLadder(db);

			const memberships = await db
				.selectFrom('memberships')
				.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
				.select(['memberships.role', 'memberships.status', 'profiles.display_name'])
				.where('memberships.organization_id', '=', roleLadderIds.organizationId)
				.orderBy('profiles.display_name')
				.execute();

			expect(memberships).toHaveLength(roleLadderPeople.length);
			expect(memberships.map((row) => row.role).sort()).toEqual([
				'admin',
				'collector',
				'collector',
				'manager',
				'owner',
				'viewer',
			]);
			// Nobody has a WorkOS account yet, so every membership is invited rather
			// than active — and the check constraint that forces the choice is
			// satisfied by the invited email.
			expect(memberships.every((row) => row.status === 'invited')).toBe(true);
		});
	});

	it('links a WorkOS account when one is supplied', async () => {
		await withTestDb(async ({ db }) => {
			await seedRoleLadder(db, { workosUserIds: { collector: 'user_01TESTCOLLECTOR' } });

			const membership = await db
				.selectFrom('memberships')
				.innerJoin('users', 'users.id', 'memberships.user_id')
				.select(['memberships.status', 'memberships.role', 'users.workos_user_id'])
				.where('memberships.organization_id', '=', roleLadderIds.organizationId)
				.executeTakeFirstOrThrow();

			expect(membership).toMatchObject({
				status: 'active',
				role: 'collector',
				workos_user_id: 'user_01TESTCOLLECTOR',
			});
		});
	});

	it('seeds the three assignee cases a collector is judged against', async () => {
		await withTestDb(async ({ db }) => {
			await seedRoleLadder(db);
			const collector = personId('collector');
			const other = personId('otherCollector');

			const assignments = await db
				.selectFrom('assignments')
				.select(['id', 'assigned_to_profile_id', 'started_at'])
				.where('organization_id', '=', roleLadderIds.organizationId)
				.execute();
			const byId = new Map(assignments.map((row) => [row.id, row]));

			expect(byId.get(roleLadderIds.ownAssignmentId)?.assigned_to_profile_id).toBe(collector);
			expect(byId.get(roleLadderIds.otherAssignmentId)?.assigned_to_profile_id).toBe(other);
			// The one that is easiest to forget and most likely to be wrong: nobody's.
			expect(byId.get(roleLadderIds.unassignedAssignmentId)?.assigned_to_profile_id).toBeNull();
			expect(byId.get(roleLadderIds.mixedAssignmentId)?.started_at).not.toBeNull();
		});
	});

	it('leaves one stop pending, so completing the assignment is refused', async () => {
		await withTestDb(async ({ db }) => {
			await seedRoleLadder(db);

			const stops = await db
				.selectFrom('assignment_items')
				.select(['completed_at', 'skipped_at'])
				.where('assignment_id', '=', roleLadderIds.mixedAssignmentId)
				.where('deleted_at', 'is', null)
				.execute();

			expect(stops).toHaveLength(3);
			expect(stops.filter((row) => row.completed_at !== null)).toHaveLength(1);
			expect(stops.filter((row) => row.skipped_at !== null)).toHaveLength(1);
			expect(
				stops.filter((row) => row.completed_at === null && row.skipped_at === null),
			).toHaveLength(1);

			// And an assignment with no stops at all, for the other precondition.
			const empty = await db
				.selectFrom('assignment_items')
				.select(['id'])
				.where('assignment_id', '=', roleLadderIds.emptyAssignmentId)
				.execute();
			expect(empty).toEqual([]);
		});
	});

	it('backdates the comment and the action that cannot be produced by clicking', async () => {
		await withTestDb(async ({ db }) => {
			await seedRoleLadder(db);

			const expired = await db
				.selectFrom('comments')
				.select(['commented_at', 'commented_by_profile_id'])
				.where('id', '=', roleLadderIds.expiredCommentId)
				.executeTakeFirstOrThrow();
			const fresh = await db
				.selectFrom('comments')
				.select(['commented_at'])
				.where('id', '=', roleLadderIds.freshCommentId)
				.executeTakeFirstOrThrow();

			expect(expired.commented_by_profile_id).toBe(personId('collector'));
			expect(daysAgo(expired.commented_at)).toBeGreaterThan(30);
			expect(daysAgo(fresh.commented_at)).toBeLessThan(1);

			const stale = await db
				.selectFrom('source_reductions')
				.select(['source_reduction_date', 'technician_profile_id'])
				.where('id', '=', roleLadderIds.staleActionId)
				.executeTakeFirstOrThrow();
			expect(stale.technician_profile_id).toBe(personId('collector'));
			expect(daysAgo(new Date(String(stale.source_reduction_date)))).toBeGreaterThan(30);
		});
	});

	it('can be run twice without duplicating or drifting', async () => {
		await withTestDb(async ({ db }) => {
			// The point of the second run: the dated fixtures are backdated from
			// *now*, so a script that only inserted would leave them drifting further
			// out of the window every day instead of sitting just past its edge.
			await seedRoleLadder(db);
			await db
				.updateTable('comments')
				.set({ commented_at: new Date('2020-01-01T00:00:00.000Z') })
				.where('id', '=', roleLadderIds.expiredCommentId)
				.execute();

			await seedRoleLadder(db);

			const profiles = await db
				.selectFrom('profiles')
				.select(['id'])
				.where('organization_id', '=', roleLadderIds.organizationId)
				.execute();
			// Six people plus the habitats each stop needs.
			expect(profiles).toHaveLength(roleLadderPeople.length);

			const assignments = await db
				.selectFrom('assignments')
				.select(['id'])
				.where('organization_id', '=', roleLadderIds.organizationId)
				.execute();
			expect(assignments).toHaveLength(5);

			const stops = await db
				.selectFrom('assignment_items')
				.select(['id'])
				.where('assignment_id', '=', roleLadderIds.mixedAssignmentId)
				.execute();
			expect(stops).toHaveLength(3);

			const expired = await db
				.selectFrom('comments')
				.select(['commented_at'])
				.where('id', '=', roleLadderIds.expiredCommentId)
				.executeTakeFirstOrThrow();
			expect(daysAgo(expired.commented_at)).toBeLessThan(60);
		});
	});
});

function personId(key: string): string {
	const person = roleLadderPeople.find((candidate) => candidate.key === key);
	if (person === undefined) {
		throw new Error(`Unknown person: ${key}`);
	}
	return person.profileId;
}

function daysAgo(value: Date): number {
	return (Date.now() - value.getTime()) / (24 * 60 * 60 * 1000);
}

/**
 * The path that matters once real accounts exist: an agency already has people,
 * invited into it with roles somebody chose, and the fixtures have to belong to
 * *them* — an assignment "assigned to the collector" is no use if it is assigned
 * to a stand-in the tester cannot sign in as.
 */
describeDbIntegration('role ladder fixtures over an existing agency', () => {
	it('attaches the fixtures to profiles that are already there', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createAgencyWithCollector(db);

			await seedRoleLadder(db, {
				organizationId: org.organizationId,
				existingProfileIds: { collector: org.collectorProfileId },
			});

			const own = await db
				.selectFrom('assignments')
				.select(['assigned_to_profile_id'])
				.where('id', '=', roleLadderIds.ownAssignmentId)
				.executeTakeFirstOrThrow();
			expect(own.assigned_to_profile_id).toBe(org.collectorProfileId);

			const comment = await db
				.selectFrom('comments')
				.select(['commented_by_profile_id'])
				.where('id', '=', roleLadderIds.expiredCommentId)
				.executeTakeFirstOrThrow();
			expect(comment.commented_by_profile_id).toBe(org.collectorProfileId);

			const action = await db
				.selectFrom('source_reductions')
				.select(['technician_profile_id'])
				.where('id', '=', roleLadderIds.ownActionId)
				.executeTakeFirstOrThrow();
			expect(action.technician_profile_id).toBe(org.collectorProfileId);
		});
	});

	it('leaves an existing membership’s role and profile untouched', async () => {
		await withTestDb(async ({ db }) => {
			const org = await createAgencyWithCollector(db);

			await seedRoleLadder(db, {
				organizationId: org.organizationId,
				existingProfileIds: { collector: org.collectorProfileId },
			});

			// The role came from a real invitation. Nothing this seed does may
			// change it, and nothing may rename the person either.
			const membership = await db
				.selectFrom('memberships')
				.select(['role', 'status'])
				.where('profile_id', '=', org.collectorProfileId)
				.executeTakeFirstOrThrow();
			expect(membership).toMatchObject({ role: 'collector', status: 'active' });

			const profile = await db
				.selectFrom('profiles')
				.select(['display_name'])
				.where('id', '=', org.collectorProfileId)
				.executeTakeFirstOrThrow();
			expect(profile.display_name).toBe('Adrian Collector');
		});
	});

	it('does not rename the agency it is pointed at', async () => {
		await withTestDb(async ({ db }) => {
			// The footgun: an upsert that set the name would rebrand a live agency
			// "Role Ladder Test District" on the way past.
			const org = await createAgencyWithCollector(db);

			await seedRoleLadder(db, { organizationId: org.organizationId });

			const organization = await db
				.selectFrom('organizations')
				.select(['name'])
				.where('id', '=', org.organizationId)
				.executeTakeFirstOrThrow();
			expect(organization.name).toBe('Middlesex County Mosquito Extermination Commission');
		});
	});

	it('still supplies the second collector the ownership cases need', async () => {
		await withTestDb(async ({ db }) => {
			// Only one collector exists, so the "somebody else's" party has to be
			// created — otherwise `otherAssignmentId` would be assigned to the same
			// person and prove nothing.
			const org = await createAgencyWithCollector(db);

			await seedRoleLadder(db, {
				organizationId: org.organizationId,
				existingProfileIds: { collector: org.collectorProfileId },
			});

			const other = await db
				.selectFrom('assignments')
				.select(['assigned_to_profile_id'])
				.where('id', '=', roleLadderIds.otherAssignmentId)
				.executeTakeFirstOrThrow();
			expect(other.assigned_to_profile_id).not.toBeNull();
			expect(other.assigned_to_profile_id).not.toBe(org.collectorProfileId);
		});
	});
});

async function createAgencyWithCollector(
	db: Parameters<typeof seedRoleLadder>[0],
): Promise<{ readonly organizationId: string; readonly collectorProfileId: string }> {
	const organization = await db
		.insertInto('organizations')
		.values({
			workos_organization_id: 'workos_mcmec_test',
			name: 'Middlesex County Mosquito Extermination Commission',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const profile = await db
		.insertInto('profiles')
		.values({ organization_id: organization.id, display_name: 'Adrian Collector' })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const user = await db
		.insertInto('users')
		.values({
			workos_user_id: 'user_01TESTCOLLECTOR',
			email: 'you+simmer-collector@gmail.com',
			display_name: 'Adrian Collector',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	await db
		.insertInto('memberships')
		.values({
			organization_id: organization.id,
			profile_id: profile.id,
			user_id: user.id,
			role: 'collector',
			status: 'active',
			is_default: true,
		})
		.execute();

	return { organizationId: organization.id, collectorProfileId: profile.id };
}
