import { createDb } from './index.js';
import {
	type ExistingProfileIds,
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
 * `SIMMER_ROLE_LADDER_WORKOS_ORGANIZATION_ID` is the WorkOS organization these
 * accounts belong to. Sign-in reads the agency from WorkOS, so without it the
 * seeded roles are unreachable: the accounts sign in to whichever agency WorkOS
 * has them in, and arrive there as viewers.
 *
 * Anyone omitted still gets a profile and a membership. That is enough to be an
 * assignee, to author a comment, and to be the subject of an API-driven check;
 * it is only signing in through the browser that needs the WorkOS account, and
 * that account has to be created there first.
 */

/**
 * The organization's own people, mapped onto the ladder by their membership role.
 *
 * Deliberately does not touch roles: it reads what is there. Two collectors are
 * used as `collector` and `otherCollector`, which is what the "somebody else's
 * record" cases need; with only one, the seed creates the second itself.
 */
async function resolveExistingProfiles(
	db: ReturnType<typeof createDb>,
	organizationId: string,
): Promise<Record<string, { readonly id: string; readonly displayName: string }>> {
	const rows = await db
		.selectFrom('memberships')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select(['memberships.role', 'profiles.id', 'profiles.display_name'])
		.where('memberships.organization_id', '=', organizationId)
		.where('memberships.status', '=', 'active')
		.where('profiles.deleted_at', 'is', null)
		.orderBy('profiles.display_name')
		.execute();

	const found: Record<string, { readonly id: string; readonly displayName: string }> = {};
	const collectors: { readonly id: string; readonly displayName: string }[] = [];
	for (const row of rows) {
		const person = { id: row.id, displayName: row.display_name };
		if (row.role === 'collector') {
			collectors.push(person);
			continue;
		}
		// First by display name when a role has more than one holder. Arbitrary,
		// which is why the caller prints who was chosen: a role with two people is
		// exactly where a silent pick would attach the fixtures to the wrong one.
		found[row.role] ??= person;
	}
	const [firstCollector, secondCollector] = collectors;
	if (firstCollector !== undefined) {
		found.collector = firstCollector;
	}
	if (secondCollector !== undefined) {
		found.otherCollector = secondCollector;
	}

	return found;
}

const databaseUrl = process.env.DATABASE_URL ?? process.env.SIMMER_DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
	console.error('DATABASE_URL or SIMMER_DATABASE_URL is required to seed role ladder fixtures.');
	process.exit(1);
}

const workosUserIds: WorkosUserIds = {};
for (const person of roleLadderPeople) {
	const key = person.key.toUpperCase();
	const value = process.env[`SIMMER_ROLE_LADDER_${key}`];
	if (value === undefined || value.trim() === '') {
		continue;
	}
	// The address is optional and only decides what `users.email` says before
	// that account's first sign-in. Worth setting, because the practical way to
	// get several logins out of one mailbox is plus-addressing and the fixture's
	// own `@example.test` address would otherwise sit there looking authoritative.
	const email = process.env[`SIMMER_ROLE_LADDER_${key}_EMAIL`]?.trim();
	workosUserIds[person.key as RoleLadderKey] =
		email === undefined || email === '' ? value.trim() : { workosUserId: value.trim(), email };
}

const db = createDb({ databaseUrl, maxConnections: 1 });

try {
	const organizationId =
		process.env.SIMMER_ROLE_LADDER_ORGANIZATION_ID ?? ROLE_LADDER_ORGANIZATION_ID;

	// When pointed at an agency that already has people — real accounts invited
	// into a real organization — attach the fixtures to *their* profiles rather
	// than to stand-ins. An assignment "assigned to the collector" is no use if
	// it is assigned to somebody the tester cannot sign in as.
	const existing = await resolveExistingProfiles(db, organizationId);
	const existingProfileIds: ExistingProfileIds = {};
	if (Object.keys(existing).length > 0) {
		console.log('Reusing profiles already in this organization:');
		for (const [key, person] of Object.entries(existing)) {
			console.log(`  ${key.padEnd(15)} ${person.displayName.padEnd(22)} ${person.id}`);
			existingProfileIds[key as RoleLadderKey] = person.id;
		}
		console.log('  (a role held by more than one person resolves to the first by name)\n');
	}

	const workosOrganizationId = process.env.SIMMER_ROLE_LADDER_WORKOS_ORGANIZATION_ID?.trim();
	const hasWorkosOrganization = workosOrganizationId !== undefined && workosOrganizationId !== '';

	const result = await seedRoleLadder(db, {
		organizationId,
		// Spread rather than a ternary: `exactOptionalPropertyTypes` is on, so the
		// key has to be absent, not present and undefined.
		...(hasWorkosOrganization ? { workosOrganizationId } : {}),
		workosUserIds,
		existingProfileIds,
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

	if (!hasWorkosOrganization) {
		console.log(
			'\nNo SIMMER_ROLE_LADDER_WORKOS_ORGANIZATION_ID, so this organization has a ' +
				'placeholder WorkOS id and cannot be signed into. Sign-in resolves the agency from ' +
				'WorkOS, so these accounts land wherever WorkOS puts them and are provisioned as ' +
				'viewers. Set it to sign in as these roles.',
		);
	}

	if (result.linkedUserCount === 0 && Object.keys(existingProfileIds).length === 0) {
		console.log(
			'No WorkOS user ids supplied and no existing profiles found, so nobody can sign in ' +
				'as these profiles yet. Create the accounts in WorkOS, then either invite them into ' +
				'this organization or re-run with SIMMER_ROLE_LADDER_<ROLE> set.',
		);
	}

	console.log('\nFixture ids:');
	console.log(`  organizationId: ${result.organizationId}`);
	for (const [name, id] of Object.entries(roleLadderIds)) {
		// `roleLadderIds.organizationId` is only the default constant. This run may
		// have been pointed somewhere else, and printing the wrong id is worse than
		// printing none.
		if (name !== 'organizationId') {
			console.log(`  ${name}: ${id}`);
		}
	}
} finally {
	await db.destroy();
}
