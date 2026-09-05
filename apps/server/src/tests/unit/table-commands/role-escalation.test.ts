/**
 * Nobody hands out a role above their own — asserted over every command that
 * names one, rather than over a list somebody remembered to extend.
 *
 * A floor in `COMMAND_PERMISSIONS` compares the actor to a rung, and that is all
 * it can do: the map holds one fixed minimum per command and never sees a
 * payload. What stops an admin minting an owner compares the actor to the role
 * *in the request*, so it stays a check a handler makes — which is exactly the
 * "guarded by convention" shape ADR 0013 set out to remove. Moving it into
 * `assertCanGrantRole` narrows the gap to one function; this file is what closes
 * it, because the type system cannot say "and every role-bearing command calls
 * that".
 *
 * The commands are derived, not listed. Each one on the `memberships` table is
 * built with `role: 'owner'` and kept if its payload came back carrying a role;
 * the ones that do are then run past an `admin`. A fifth role-bearing command
 * added without the check fails here on the day it is written, and a command that
 * stops carrying a role drops out without anything to update.
 *
 * `identity.endMembership` names no role and is absent for that reason. Its bound
 * is the same rule against the *stored* role, and it is asserted in
 * `memberships.test.ts` beside the reads that answer it.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import { CommandError } from '../../../command-endpoint.js';
import type { CommandTable } from '../../../command-payload.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { membershipTableCommands } from '../../../table-commands/memberships.js';

const ORG = '33333333-3333-4333-8333-333333333333';
const ACTOR_PROFILE = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';

const spec = membershipTableCommands(undefined as never, unusableAuth()) as TableCommands<
	'memberships',
	// biome-ignore lint/suspicious/noExplicitAny: the union is the module's; only
	// `payload.role` is read off a built command here.
	any,
	unknown,
	string
>;

/** Every command on the table whose built payload carries a role. */
const roleBearing = Object.keys(spec.intents).filter((intent) => {
	const payload = build(intent, 'owner').payload as { readonly role?: unknown };
	return payload.role !== undefined;
});

describe('role escalation', () => {
	it('finds the role-bearing commands rather than trusting a list', () => {
		// A guard on the guard: an empty set would make every case below pass by not
		// existing. Three today — inviting, re-inviting, and promoting.
		expect(roleBearing).toEqual(
			expect.arrayContaining(['identity.invite', 'identity.reinvite', 'identity.changeRole']),
		);
	});

	it.each(roleBearing)('%s refuses an admin handing out owner', async (intent) => {
		const before = spec.run.secondSystem?.before;
		if (before === undefined) {
			throw new Error('memberships must declare the half that refuses an escalation.');
		}

		const thrown = await Promise.resolve(before(build(intent, 'owner'), authContext('admin'))).then(
			() => null,
			(error: unknown) => error,
		);

		expect(thrown).toBeInstanceOf(CommandError);
		expect((thrown as CommandError).status).toBe(403);
		expect((thrown as CommandError).body).toMatchObject({ error: 'forbidden' });
	});

	it.each(roleBearing)('%s lets an owner hand out owner', async (intent) => {
		const before = spec.run.secondSystem?.before;
		if (before === undefined) {
			throw new Error('memberships must declare the half that refuses an escalation.');
		}

		await expect(before(build(intent, 'owner'), authContext('owner'))).resolves.toBeUndefined();
	});

	it.each(roleBearing)('%s lets an admin hand out a rung below their own', async (intent) => {
		const before = spec.run.secondSystem?.before;
		if (before === undefined) {
			throw new Error('memberships must declare the half that refuses an escalation.');
		}

		await expect(before(build(intent, 'manager'), authContext('admin'))).resolves.toBeUndefined();
	});
});

function build(intent: string, role: string): { readonly payload: unknown } {
	const builder = spec.intents[intent as never] as (
		request: IntentRequest<CommandTable, string>,
	) => {
		readonly payload: unknown;
	};
	return builder({
		payload: { profile_id: PROFILE, invited_email: 'casey@example.test', role },
		organization: { organizationId: ORG, actorProfileId: ACTOR_PROFILE },
		authContext: authContext('owner'),
		id: MEMBERSHIP,
	});
}

/**
 * WorkOS, as the thing a refusal must never reach.
 *
 * Every case here is refused or waved through on the role alone, so any call at
 * all is the failure.
 */
function unusableAuth() {
	const refuse = () => {
		throw new Error('WorkOS must not be reached while a role is being checked.');
	};
	return {
		sendOrganizationInvitation: refuse,
		revokeInvitation: refuse,
		deactivateOrganizationMembership: refuse,
	} as never;
}

function authContext(role: string): AuthContext {
	return {
		organization: { id: ORG, workosOrganizationId: 'workos_org_1' },
		profile: { id: ACTOR_PROFILE },
		membership: { id: '55555555-5555-4555-8555-555555555555' },
		workosUser: { workosUserId: 'workos_user_actor' },
		role,
	} as AuthContext;
}
