/**
 * `/commands/memberships`, which is the only table on the surface with a second
 * system behind it.
 *
 * Two halves are tested apart, because that is how they run. The intent map is a
 * pure translation from column names to domain arguments and needs nothing. The
 * WorkOS half is `run.secondSystem`, whose `before` the command runner calls
 * ahead of the transaction and whose `after` it calls once that has committed —
 * so which hook a call lands in *is* the ordering claim, and asserting it here
 * asserts the order.
 *
 * What is not here is the invitation's Postgres half. Its refusals are reads
 * against a live schema — one live invitation per address, a Profile that already
 * has a login — and a fake transaction that answered them would only be repeating
 * this file's own assumptions back to it.
 */

import type { DomainValidationError } from '@simmer-mosquito/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import { CommandError } from '../../../command-endpoint.js';
import type { CommandTable } from '../../../command-payload.js';
import type { MembershipAuth } from '../../../membership-commands.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import { membershipTableCommands } from '../../../table-commands/memberships.js';
import { withoutWorkOsIdentityWrites } from '../../../workos-identity-interlock.js';

const { stampOrganizationInvitation, clearOrganizationInvitationStamp } = vi.hoisted(() => ({
	stampOrganizationInvitation: vi.fn(),
	clearOrganizationInvitationStamp: vi.fn(),
}));

// Only the two writes to `workos_invitation_id`. Everything else this module
// imports from `packages/db` is a pure function or the reference gate, and
// replacing those would leave the refusals below asserting a mock rather than a
// rule.
vi.mock('@simmer-mosquito/db', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	stampOrganizationInvitation,
	clearOrganizationInvitationStamp,
}));

const ORG = '33333333-3333-4333-8333-333333333333';
const ACTOR_PROFILE = '44444444-4444-4444-8444-444444444444';
const ACTOR_MEMBERSHIP = '55555555-5555-4555-8555-555555555555';
const MEMBERSHIP = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';

// ---------------------------------------------------------------------------
// The intent map
// ---------------------------------------------------------------------------

describe('memberships intent map', () => {
	it('reads an invitation off column names', () => {
		const command = build('identity.invite', {
			profile_id: PROFILE,
			invited_email: 'Casey@Example.Test',
			display_name: 'Casey Field',
			role: 'manager',
		});

		expect(command.payload).toMatchObject({
			organizationId: ORG,
			actorProfileId: ACTOR_PROFILE,
			membershipId: MEMBERSHIP,
			profileId: PROFILE,
			// Lower-cased in the builder, because the uniqueness rule the schema owns
			// is on `lower(invited_email)`.
			invitedEmail: 'casey@example.test',
			displayName: 'Casey Field',
			role: 'manager',
		});
	});

	// A word that is not one of the five arrives as no role at all, and the builder
	// names it. Passing it through as a `SimmerRole` would push the same refusal
	// down to Postgres, where it arrives as an enum error and a 500.
	it('refuses a role that is not one of the five', () => {
		const thrown = (() => {
			try {
				build('identity.changeRole', { role: 'superuser' });
				return null;
			} catch (error) {
				return error as DomainValidationError;
			}
		})();

		expect(thrown?.issues).toContainEqual({
			path: 'role',
			message: 'role must be owner, admin, manager, collector, or viewer.',
		});
	});

	// The columns a client sends with this move its optimistic row. The command
	// takes no fields at all, and the server writes both of them from the name.
	it('takes nothing off the body when a membership ends', () => {
		const command = build('identity.endMembership', { status: 'inactive', is_default: false });

		expect(command.payload).toEqual({
			organizationId: ORG,
			actorProfileId: ACTOR_PROFILE,
			membershipId: MEMBERSHIP,
		});
	});
});

// ---------------------------------------------------------------------------
// The WorkOS half
// ---------------------------------------------------------------------------

describe('an invitation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		stampOrganizationInvitation.mockResolvedValue({ id: MEMBERSHIP });
	});

	it('mails the link and records its id, after the row is written', async () => {
		const auth = fakeAuth();
		const db = invitationStateDb({
			invited_email: 'casey@example.test',
			workos_invitation_id: null,
		});

		await secondSystem(db, auth).after(build('identity.invite', invitePayload()), authContext());

		expect(auth.sendOrganizationInvitation).toHaveBeenCalledWith({
			email: 'casey@example.test',
			workosOrganizationId: 'workos_org_1',
			inviterWorkosUserId: 'workos_user_actor',
		});
		expect(stampOrganizationInvitation).toHaveBeenCalledWith(expect.anything(), {
			id: MEMBERSHIP,
			organizationId: ORG,
			workosInvitationId: 'inv_1',
		});
	});

	// Rule two, and the reason the client mints the id. A retry whose first attempt
	// got all the way through finds the row already stamped, so nothing is mailed a
	// second time.
	it('mails nothing when the Membership is already invited', async () => {
		const auth = fakeAuth();
		const db = invitationStateDb({
			invited_email: 'casey@example.test',
			workos_invitation_id: 'inv_1',
		});

		await secondSystem(db, auth).after(build('identity.invite', invitePayload()), authContext());

		expect(auth.sendOrganizationInvitation).not.toHaveBeenCalled();
		expect(stampOrganizationInvitation).not.toHaveBeenCalled();
	});

	// The Membership stays. It reads on the People page as somebody invited who
	// never got a link, and a re-invitation repairs it. The other order sends a
	// working link to somebody the agency has no row for.
	it('answers 502 when WorkOS refuses, leaving the row written', async () => {
		const auth = fakeAuth();
		auth.sendOrganizationInvitation.mockRejectedValue(new Error('WorkOS is down'));
		const db = invitationStateDb({
			invited_email: 'casey@example.test',
			workos_invitation_id: null,
		});

		const thrown = await secondSystem(db, auth)
			.after(build('identity.invite', invitePayload()), authContext())
			.catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(CommandError);
		expect((thrown as CommandError).status).toBe(502);
		// #220: WorkOS is unreachable rather than refusing, and the body says so in
		// this server's words. `WorkOS is down` reaches the log, not the browser.
		expect((thrown as CommandError).body).toEqual({
			error: 'invitation_service_unavailable',
			reason: 'The invitation could not be sent. Try again shortly.',
		});
	});

	// #207: two attempts and no more. The mail is out and the row exists, so the
	// invitation happened; the log line is where the id survives.
	it('retries a stamp that failed once', async () => {
		stampOrganizationInvitation.mockRejectedValueOnce(new Error('connection terminated'));
		const db = invitationStateDb({
			invited_email: 'casey@example.test',
			workos_invitation_id: null,
		});

		await secondSystem(db, fakeAuth()).after(
			build('identity.invite', invitePayload()),
			authContext(),
		);

		expect(stampOrganizationInvitation).toHaveBeenCalledTimes(2);
	});

	it('logs the invitation id when the stamp will not write', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		stampOrganizationInvitation.mockRejectedValue(new Error('connection terminated'));
		const db = invitationStateDb({
			invited_email: 'casey@example.test',
			workos_invitation_id: null,
		});

		await secondSystem(db, fakeAuth()).after(
			build('identity.invite', invitePayload()),
			authContext(),
		);

		const line = String(logged.mock.calls[0]?.[0]);
		expect(line).toContain('inv_1');
		expect(line).toContain(MEMBERSHIP);
		expect(line).toContain(ORG);

		logged.mockRestore();
	});
});

describe('a re-invitation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		stampOrganizationInvitation.mockResolvedValue({ id: MEMBERSHIP });
		clearOrganizationInvitationStamp.mockResolvedValue(undefined);
	});

	/** The row this command exists for: invited, holding a live WorkOS link. */
	function holdingInvitation() {
		return invitationStateDb({
			invited_email: 'casey@example.test',
			workos_invitation_id: 'inv_1',
		});
	}

	// #218. WorkOS holds one invitation per address and organization, and the
	// re-invite control is only offered on a Membership holding one, so a send that
	// goes first is refused every time rather than occasionally. The fake holds
	// `inv_1`, which is what makes this fail against the old order.
	it('revokes the invitation it replaces before mailing the new one', async () => {
		const calls: string[] = [];
		const auth = fakeAuth({ pending: 'inv_1', issues: 'inv_2', calls });
		stampOrganizationInvitation.mockImplementation(async () => {
			calls.push('stamp');
			return { id: MEMBERSHIP };
		});
		clearOrganizationInvitationStamp.mockImplementation(async () => {
			calls.push('forget');
		});

		await secondSystem(holdingInvitation(), auth).after(
			build('identity.reinvite', { role: 'manager' }),
			authContext(),
		);

		expect(calls).toEqual(['revoke', 'forget', 'send', 'stamp']);
		expect(auth.revokeInvitation).toHaveBeenCalledWith('inv_1');
		expect(stampOrganizationInvitation).toHaveBeenCalledWith(expect.anything(), {
			id: MEMBERSHIP,
			organizationId: ORG,
			workosInvitationId: 'inv_2',
		});
	});

	// The row must not go on naming a link WorkOS has already killed. Cleared, it
	// is #207's shape, which every path reads as nothing to revoke.
	it('drops the old id as soon as the revoke lands', async () => {
		const auth = fakeAuth({ pending: 'inv_1', issues: 'inv_2' });

		await secondSystem(holdingInvitation(), auth).after(
			build('identity.reinvite', { role: 'manager' }),
			authContext(),
		);

		expect(clearOrganizationInvitationStamp).toHaveBeenCalledWith(expect.anything(), {
			id: MEMBERSHIP,
			organizationId: ORG,
		});
	});

	// The cost of the order the owner chose. The person is left with no link at
	// all, no screen shows it, and this line is the only record of who.
	it('names the revoked invitation in the log when the replacement will not send', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const auth = fakeAuth({ pending: 'inv_1', issues: 'inv_2' });
		auth.sendOrganizationInvitation.mockRejectedValue(new Error('WorkOS is down'));

		const thrown = await secondSystem(holdingInvitation(), auth)
			.after(build('identity.reinvite', { role: 'manager' }), authContext())
			.catch((error: unknown) => error);

		expect((thrown as CommandError).status).toBe(502);
		// Two lines now (#220): the send names the refusal first, then this one
		// names what the revoke already took. Found by content rather than by
		// index, because which is written first is not what the test is about.
		const line = logged.mock.calls
			.map((call) => String(call[0]))
			.find((written) => written.includes('inv_1'));
		expect(line).toBeDefined();
		expect(line).toContain(MEMBERSHIP);
		expect(line).toContain(ORG);

		logged.mockRestore();
	});

	// #207 from the other end: a Membership whose stamp was lost has no invitation
	// id, and that is a row with nothing to revoke rather than an error.
	it('re-invites a row whose stamp was lost, with nothing to revoke', async () => {
		const auth = fakeAuth();
		const db = invitationStateDb({
			invited_email: 'casey@example.test',
			workos_invitation_id: null,
		});

		await secondSystem(db, auth).after(
			build('identity.reinvite', { role: 'manager' }),
			authContext(),
		);

		expect(auth.sendOrganizationInvitation).toHaveBeenCalledOnce();
		expect(auth.revokeInvitation).not.toHaveBeenCalled();
		expect(clearOrganizationInvitationStamp).not.toHaveBeenCalled();
	});

	// #224. The revoke used to throw raw, which matched no branch in the command
	// error handler and reached the browser as an empty 500. Both service codes
	// are covered because they are two different next moves.
	it.each([
		{ status: 503, code: 'invitation_service_unavailable' },
		{ status: 403, code: 'invitation_service_unauthorized' },
	])('answers 502 with $code when the revoke fails with $status', async ({ status, code }) => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const auth = fakeAuth({ pending: 'inv_1', issues: 'inv_2' });
		auth.revokeInvitation.mockRejectedValue(
			Object.assign(new Error('Email already invited to organization.'), { status }),
		);

		const thrown = await secondSystem(holdingInvitation(), auth)
			.after(build('identity.reinvite', { role: 'manager' }), authContext())
			.catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(CommandError);
		expect((thrown as CommandError).status).toBe(502);
		expect((thrown as CommandError).body).toMatchObject({ error: code });
		// What WorkOS said is the log's, not the browser's.
		expect(JSON.stringify((thrown as CommandError).body)).not.toContain('already invited');
		expect(String(logged.mock.calls[0]?.[0])).toContain('Revoke refused');

		logged.mockRestore();
	});

	// The property that makes a retry free: nothing was sent and the row still
	// names the invitation the person is holding, so there is something to revoke
	// on the next attempt.
	it('leaves the row naming the old invitation when the revoke fails', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const auth = fakeAuth({ pending: 'inv_1', issues: 'inv_2' });
		auth.revokeInvitation.mockRejectedValue(new Error('WorkOS is down'));

		await secondSystem(holdingInvitation(), auth)
			.after(build('identity.reinvite', { role: 'manager' }), authContext())
			.catch(() => undefined);

		expect(clearOrganizationInvitationStamp).not.toHaveBeenCalled();
		expect(auth.sendOrganizationInvitation).not.toHaveBeenCalled();
		expect(stampOrganizationInvitation).not.toHaveBeenCalled();

		logged.mockRestore();
	});

	// A revoke WorkOS reads as already settled is not a failure: the invitation is
	// accepted, expired or gone, which is the state the caller wanted.
	it('goes on to the send when there was nothing left to revoke', async () => {
		const auth = fakeAuth({ pending: 'inv_9', issues: 'inv_2' });

		await secondSystem(holdingInvitation(), auth).after(
			build('identity.reinvite', { role: 'manager' }),
			authContext(),
		);

		expect(auth.revokeInvitation).toHaveBeenCalledWith('inv_1');
		expect(auth.sendOrganizationInvitation).toHaveBeenCalledOnce();
	});
});

describe('ending a membership', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// WorkOS first, and this is what says so: the deactivation is in `before`, which
	// the command runner calls with nothing written yet. Ending the SIMMER row and
	// then failing would leave somebody who reads as removed and can still sign in.
	it('ends the WorkOS grant before anything is written', async () => {
		const auth = fakeAuth();
		const db = removalDb({ role: 'manager', status: 'active', workos_user_id: 'user_casey' });

		await secondSystem(db, auth).before(build('identity.endMembership', {}), authContext());

		expect(auth.deactivateOrganizationMembership).toHaveBeenCalledWith({
			workosUserId: 'user_casey',
			workosOrganizationId: 'workos_org_1',
		});
	});

	// A membership still at `invited` has no user behind it in either system.
	it('calls WorkOS nothing when there is no login yet', async () => {
		const auth = fakeAuth();
		const db = removalDb({ role: 'viewer', status: 'invited', workos_user_id: null });

		await secondSystem(db, auth).before(build('identity.endMembership', {}), authContext());

		expect(auth.deactivateOrganizationMembership).not.toHaveBeenCalled();
	});

	it('refuses the last active owner, before WorkOS is touched', async () => {
		const auth = fakeAuth();
		const db = removalDb(
			{ role: 'owner', status: 'active', workos_user_id: 'user_casey' },
			{ activeOwners: 1 },
		);

		const thrown = await secondSystem(db, auth)
			.before(build('identity.endMembership', {}), authContext())
			.catch((error: unknown) => error);

		expect((thrown as CommandError).status).toBe(409);
		expect((thrown as CommandError).body).toMatchObject({ error: 'last_active_owner' });
		expect(auth.deactivateOrganizationMembership).not.toHaveBeenCalled();
	});

	it('refuses removing your own access', async () => {
		const auth = fakeAuth();
		const db = removalDb({ role: 'owner', status: 'active', workos_user_id: 'user_actor' });

		const thrown = await secondSystem(db, auth)
			.before(build('identity.endMembership', {}, ACTOR_MEMBERSHIP), authContext())
			.catch((error: unknown) => error);

		expect((thrown as CommandError).body).toMatchObject({ error: 'membership_is_self' });
		expect(auth.deactivateOrganizationMembership).not.toHaveBeenCalled();
	});

	it('answers 404 for a membership in another agency', async () => {
		const db = removalDb(null);

		const thrown = await secondSystem(db, fakeAuth())
			.before(build('identity.endMembership', {}), authContext())
			.catch((error: unknown) => error);

		expect((thrown as CommandError).status).toBe(404);
		expect((thrown as CommandError).body).toMatchObject({ error: 'membership_not_found' });
	});
});

describe('the staging identity interlock', () => {
	// All four refuse in `before`, ahead of the transaction, and that is the
	// point. `identity.invite` and `identity.reinvite` call WorkOS from `after`,
	// so a refusal raised at the WorkOS boundary alone would arrive with the
	// Membership row already committed and Electric syncing it onto the People
	// page under the error message.
	it.each([
		['identity.invite', invitePayload()],
		['identity.reinvite', { role: 'manager' }],
		['identity.changeRole', { role: 'manager' }],
		['identity.endMembership', {}],
	] as const)('refuses %s before anything is written', async (intent, payload) => {
		const workos = fakeAuth();

		// `undefined` for the database: reaching a read would throw something
		// other than the refusal, which is what proves nothing ran first.
		const thrown = await secondSystem(undefined, withoutWorkOsIdentityWrites(workos))
			.before(build(intent, payload), authContext())
			.catch((error: unknown) => error);

		expect((thrown as CommandError).status).toBe(403);
		expect((thrown as CommandError).body).toMatchObject({
			error: 'workos_identity_writes_disabled',
		});
		expect(workos.sendOrganizationInvitation).not.toHaveBeenCalled();
		expect(workos.deactivateOrganizationMembership).not.toHaveBeenCalled();
	});

	// The hook carries `assertCanGrantRole` for three of the four commands, which
	// is why #376 declined to skip it wholesale: skipping it would let an admin
	// promote somebody to owner and reopen the escalation #121 closed.
	it('still refuses a promotion above the actor when the interlock is off', async () => {
		const thrown = await secondSystem(undefined, fakeAuth())
			.before(build('identity.changeRole', { role: 'owner' }), {
				...authContext(),
				role: 'manager',
			} as AuthContext)
			.catch((error: unknown) => error);

		expect((thrown as CommandError).status).toBe(403);
		expect((thrown as CommandError).body).toMatchObject({ error: 'forbidden' });
	});
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const spec = membershipTableCommands(undefined as never, undefined as never) as TableCommands<
	'memberships',
	// biome-ignore lint/suspicious/noExplicitAny: the union is the module's, and
	// only `payload` is read off a built command here.
	any,
	unknown,
	string
>;

function build(
	intent: string,
	payload: Record<string, unknown>,
	id: string = MEMBERSHIP,
): BuiltCommand {
	const builder = spec.intents[intent as never] as
		| ((request: IntentRequest<CommandTable, string>) => BuiltCommand)
		| undefined;
	if (builder === undefined) {
		throw new Error(`memberships does not accept ${intent}.`);
	}
	return builder({
		payload,
		agency: { organizationId: ORG, actorProfileId: ACTOR_PROFILE },
		authContext: authContext(),
		id,
	});
}

/** What a builder hands back, which is all these cases read off one. */
type BuiltCommand = { readonly type: string; readonly payload: unknown };

/**
 * The two hooks, widened to the shape {@link build} produces.
 *
 * The cast is the price of building a command by hand: `spec.intents` is keyed by
 * name and the union it produces is not narrowed by a string, so nothing here can
 * prove to the compiler that the command it built is the one the hook takes.
 */
function secondSystem(db: unknown, auth: MembershipAuth) {
	const configured = membershipTableCommands(db as never, auth).run.secondSystem;
	if (configured?.before === undefined || configured.after === undefined) {
		throw new Error('memberships must declare both halves of its second system.');
	}
	return {
		before: configured.before as (command: BuiltCommand, auth: AuthContext) => Promise<void>,
		after: configured.after as (command: BuiltCommand, auth: AuthContext) => Promise<void>,
	};
}

/**
 * WorkOS, including the rule that made #218 fail on every call.
 *
 * `pending` is the invitation WorkOS is already holding for this address and
 * organization. While there is one, a send is refused with the message live
 * staging answered, so a fake that starts with one can tell revoke-then-send
 * apart from send-then-revoke. Left at `null` it accepts the first send, which
 * is every case that is not a re-invitation.
 */
function fakeAuth(
	options: {
		readonly pending?: string;
		readonly issues?: string;
		/** Every WorkOS call, in the order it was made. */
		readonly calls?: string[];
	} = {},
) {
	let pending = options.pending ?? null;
	const issues = options.issues ?? 'inv_1';

	return {
		sendOrganizationInvitation: vi.fn(async () => {
			options.calls?.push('send');
			if (pending !== null) {
				throw new Error('Email already invited to organization.');
			}
			pending = issues;
			return { id: issues };
		}),
		revokeInvitation: vi.fn(async (invitationId: string) => {
			options.calls?.push('revoke');
			const settled = pending !== invitationId;
			pending = null;
			return { status: settled ? ('already_settled' as const) : ('revoked' as const) };
		}),
		deactivateOrganizationMembership: vi.fn(async () => ({ status: 'deactivated' as const })),
	};
}

function invitePayload() {
	return {
		profile_id: PROFILE,
		invited_email: 'casey@example.test',
		display_name: 'Casey Field',
		role: 'manager',
	};
}

/** A database that answers the one read the invitation halves make. */
function invitationStateDb(row: {
	readonly invited_email: string | null;
	readonly workos_invitation_id: string | null;
}) {
	return { selectFrom: () => chain({ executeTakeFirst: async () => row }) };
}

/**
 * A database that answers the two reads ending a membership makes.
 *
 * The queries differ only in how they finish — `executeTakeFirst` for the target,
 * `executeTakeFirstOrThrow` for the active-owner count — so one proxy serves both.
 */
function removalDb(
	target: {
		readonly role: string;
		readonly status: string;
		readonly workos_user_id: string | null;
	} | null,
	options: { readonly activeOwners?: number } = {},
) {
	return {
		selectFrom: () =>
			chain({
				executeTakeFirst: async () => target ?? undefined,
				executeTakeFirstOrThrow: async () => ({ count: options.activeOwners ?? 2 }),
			}),
	};
}

/** A Kysely builder that answers every method with itself, and finishes as told. */
function chain(terminals: Record<string, () => Promise<unknown>>): unknown {
	const builder: unknown = new Proxy(
		{},
		{
			get(_unused, property) {
				const terminal = terminals[property as string];
				return terminal ?? (() => builder);
			},
		},
	);
	return builder;
}

function authContext(): AuthContext {
	return {
		organization: { id: ORG, workosOrganizationId: 'workos_org_1' },
		profile: { id: ACTOR_PROFILE },
		membership: { id: ACTOR_MEMBERSHIP },
		workosUser: { workosUserId: 'workos_user_actor' },
		role: 'owner',
	} as AuthContext;
}
