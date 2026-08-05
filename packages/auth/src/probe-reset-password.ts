import { WorkOS } from '@workos-inc/node';

/**
 * Captures what WorkOS actually sends when a password reset fails (#54).
 *
 * `isPasswordRejection` tells two different 422s apart — a password refused by
 * the organization's policy, and a reset token that is spent or malformed — and
 * getting it wrong misdirects the user in one of two ways: "choose a stronger
 * password" when the link expired, or "your link expired" when the password was
 * the problem. The split is currently based on *inferred* code names.
 *
 * This asks the live API instead. It is deliberately a script rather than a
 * test: the answer is an observation about someone else's service, not a
 * property of this code, and it should be re-run when WorkOS changes rather
 * than failing CI when they do.
 *
 * ## What it does to the environment
 *
 * Creates one throwaway user, provokes each failure against it, then deletes
 * it. `createPasswordReset` returns the token in its response, so **no email is
 * sent** at any point. The user is deleted in a `finally`, so an unexpected
 * failure still cleans up; if the delete itself fails, the id is printed so it
 * can be removed by hand.
 *
 * ## Running it
 *
 * ```sh
 * WORKOS_API_KEY=<staging key> pnpm --filter @simmer-mosquito/auth probe:reset-password
 * ```
 *
 * Point it at **staging**. It creates a user.
 */

const apiKey = process.env.WORKOS_API_KEY;

if (apiKey === undefined || apiKey.trim() === '') {
	console.error('WORKOS_API_KEY is required. Use the staging key — this script creates a user.');
	process.exit(1);
}

const workos = new WorkOS(apiKey.trim());

/** Unique per run, so a leaked user from a previous run does not collide. */
const email = `simmer-reset-probe-${Date.now()}@simmer-probe.example.com`;
const VALID_PASSWORD = 'Correct-Horse-Battery-Staple-71';

interface Observation {
	readonly scenario: string;
	readonly name: string;
	readonly status: unknown;
	readonly code: unknown;
	readonly message: string;
	readonly errors: unknown;
}

const observations: Observation[] = [];
let userId: string | null = null;

try {
	const user = await workos.userManagement.createUser({
		email,
		password: VALID_PASSWORD,
		emailVerified: true,
	});
	userId = user.id;
	console.log(`Created probe user ${user.id} <${email}>.\n`);

	// 1 + 2: a valid token, refused on the password.
	await observe('valid token, password below the policy minimum', async () => {
		const reset = await workos.userManagement.createPasswordReset({ email });
		await workos.userManagement.resetPassword({
			token: reset.passwordResetToken,
			newPassword: 'a',
		});
	});

	await observe('valid token, known-breached password', async () => {
		const reset = await workos.userManagement.createPasswordReset({ email });
		await workos.userManagement.resetPassword({
			token: reset.passwordResetToken,
			newPassword: 'Password123!',
		});
	});

	// 3: a token that worked once. The reset has to succeed first, which is also
	// the only positive case here — if this step throws, the rest is meaningless.
	const spent = await workos.userManagement.createPasswordReset({ email });
	await workos.userManagement.resetPassword({
		token: spent.passwordResetToken,
		newPassword: `${VALID_PASSWORD}-2`,
	});
	console.log('A valid reset succeeded, as it must for the spent-token case to mean anything.\n');

	await observe('already-used token', async () => {
		await workos.userManagement.resetPassword({
			token: spent.passwordResetToken,
			newPassword: `${VALID_PASSWORD}-3`,
		});
	});

	// 5: malformed. An *expired* token is the one case this cannot produce —
	// WorkOS decides the lifetime and it is measured in hours, so it has to be
	// observed by hand or inferred from the spent-token shape.
	await observe('malformed token', async () => {
		await workos.userManagement.resetPassword({
			token: 'not-a-real-token',
			newPassword: VALID_PASSWORD,
		});
	});

	// The issue's closing note: `acceptInvitationWithPassword` and `signUp` map
	// any 422 from `createUser`/`updateUser` to `weak_password` without
	// disambiguating, so the same question applies to them.
	await observe('createUser with a weak password', async () => {
		await workos.userManagement.createUser({
			email: `simmer-reset-probe-weak-${Date.now()}@simmer-probe.example.com`,
			password: 'a',
		});
	});

	await observe('updateUser with a weak password', async () => {
		if (userId === null) {
			throw new Error('No probe user to update.');
		}
		await workos.userManagement.updateUser({ userId, password: 'a' });
	});

	console.log('\n=== Observations ===\n');
	console.log(JSON.stringify(observations, null, 2));
	console.log(
		'\nNot covered: an expired token. WorkOS sets the lifetime, so it has to be' +
			'\nleft to expire and re-run by hand.',
	);
} finally {
	if (userId !== null) {
		try {
			await workos.userManagement.deleteUser(userId);
			console.log(`\nDeleted probe user ${userId}.`);
		} catch (error) {
			console.error(
				`\nCould not delete probe user ${userId}; remove it by hand.`,
				error instanceof Error ? error.message : error,
			);
		}
	}
}

/** Runs a step that is expected to throw, and records the exception's shape. */
async function observe(scenario: string, run: () => Promise<unknown>): Promise<void> {
	try {
		await run();
		observations.push({
			scenario,
			name: '(no error thrown)',
			status: null,
			code: null,
			message: 'The call succeeded, which the mapping does not expect.',
			errors: null,
		});
		console.log(`- ${scenario}: no error thrown`);
	} catch (error) {
		const record = error as Record<string, unknown>;
		const observation: Observation = {
			scenario,
			name: error instanceof Error ? error.name : typeof error,
			status: record.status ?? null,
			code: record.code ?? null,
			message: error instanceof Error ? error.message : String(error),
			errors: record.errors ?? null,
		};
		observations.push(observation);
		console.log(
			`- ${scenario}: ${observation.name} status=${observation.status} code=${observation.code}`,
		);
	}
}
