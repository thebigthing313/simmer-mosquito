import { createDb } from './index.js';
import {
	ROLE_LADDER_ORGANIZATION_ID,
	type RoleLadderKey,
	roleLadderIds,
	roleLadderPeople,
	seedRoleLadder,
	type WorkosUserIds,
} from './seeds/role-ladder.js';

/**
 * Seeds the fixtures the role ladder needs to be verified by hand (#57).
 *
 * Idempotent: every row is keyed on a fixed id and upserted, so re-running it
 * resets the dated fixtures — the expired comment and the stale control action
 * are backdated from *now*, and would otherwise drift further out of the window
 * every day rather than staying just past its edge.
 *
 * WorkOS user ids are optional and come from the environment, one per role:
 *
 *   SIMMER_ROLE_LADDER_COLLECTOR=user_01ABC…
 *   SIMMER_ROLE_LADDER_MANAGER=user_01DEF…
 *
 * Anyone omitted still gets a profile and a membership. That is enough to be an
 * assignee, to author a comment, and to be the subject of an API-driven check;
 * it is only signing in through the browser that needs the WorkOS account, and
 * that account has to be created there first.
 */

const databaseUrl = process.env.DATABASE_URL ?? process.env.SIMMER_DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
	console.error('DATABASE_URL or SIMMER_DATABASE_URL is required to seed role ladder fixtures.');
	process.exit(1);
}

const workosUserIds: WorkosUserIds = {};
for (const person of roleLadderPeople) {
	const value = process.env[`SIMMER_ROLE_LADDER_${person.key.toUpperCase()}`];
	if (value !== undefined && value.trim() !== '') {
		workosUserIds[person.key as RoleLadderKey] = value.trim();
	}
}

const db = createDb({ databaseUrl, maxConnections: 1 });

try {
	const result = await seedRoleLadder(db, {
		organizationId: process.env.SIMMER_ROLE_LADDER_ORGANIZATION_ID ?? ROLE_LADDER_ORGANIZATION_ID,
		workosUserIds,
	});

	console.log(
		[
			`Seeded role ladder organization ${result.organizationId}.`,
			`profiles=${result.profileCount}`,
			`linked_users=${result.linkedUserCount}`,
			`assignments=${result.assignmentCount}`,
			`comments=${result.commentCount}`,
			`actions=${result.actionCount}`,
		].join(' '),
	);

	if (result.linkedUserCount === 0) {
		console.log(
			'No WorkOS user ids supplied, so nobody can sign in as these profiles yet. ' +
				'Create the accounts in WorkOS, then re-run with SIMMER_ROLE_LADDER_<ROLE> set.',
		);
	}

	console.log('\nFixture ids:');
	for (const [name, id] of Object.entries(roleLadderIds)) {
		console.log(`  ${name}: ${id}`);
	}
} finally {
	await db.destroy();
}
