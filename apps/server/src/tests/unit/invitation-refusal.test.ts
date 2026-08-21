/**
 * #220: WorkOS writes the message and this server writes the name.
 *
 * The thing each case is really asserting is that the raw string never appears
 * in what comes back, so every one of them throws a message that would be a leak
 * and then checks the answer for it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refuseInvitationSend } from '../../invitation-refusal.js';

const attempt = { membershipId: 'mem-1', organizationId: 'org-1' };
const leak = 'Email already invited to organization: casey@other-agency.test (user_01ABC).';

function workosError(status: number) {
	return Object.assign(new Error(leak), { status });
}

describe('refuseInvitationSend', () => {
	let logged: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		logged.mockRestore();
	});

	it('names a refused address without repeating what WorkOS said', () => {
		const refusal = refuseInvitationSend(workosError(422), attempt);

		expect(refusal.error).toBe('invitation_refused');
		expect(refusal.reason).not.toContain('WorkOS');
		expect(refusal.reason).not.toContain('other-agency');
		expect(JSON.stringify(refusal)).not.toContain(leak);
	});

	it.each([400, 404, 409, 422])('reads %i as a refusal of the address', (status) => {
		expect(refuseInvitationSend(workosError(status), attempt).error).toBe('invitation_refused');
	});

	it.each([401, 403])('reads %i as SIMMER not being allowed to invite', (status) => {
		const refusal = refuseInvitationSend(workosError(status), attempt);

		expect(refusal.error).toBe('invitation_service_unauthorized');
		// The one thing worth telling somebody who cannot fix it: stop retrying.
		expect(refusal.reason).toContain('trying again will not help');
	});

	it.each([429, 500, 502, 503])('reads %i as worth retrying', (status) => {
		const refusal = refuseInvitationSend(workosError(status), attempt);

		expect(refusal.error).toBe('invitation_service_unavailable');
		expect(refusal.reason).toContain('Try again shortly');
	});

	// A request that never got an answer carries no status. It is not a refusal,
	// so it must not read as one: the address is fine and the network was not.
	it('reads an error with no status as worth retrying', () => {
		expect(refuseInvitationSend(new Error('fetch failed'), attempt).error).toBe(
			'invitation_service_unavailable',
		);
	});

	it('survives a thrown value that is not an error at all', () => {
		expect(refuseInvitationSend('nope', attempt).error).toBe('invitation_service_unavailable');
		expect(refuseInvitationSend(null, attempt).error).toBe('invitation_service_unavailable');
	});

	// The log is where the raw message survives, and it carries the two ids an
	// operator needs to find the row.
	it('logs the name and the original error', () => {
		const error = workosError(422);
		refuseInvitationSend(error, attempt);

		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining('invitation_refused') as unknown as string,
			error,
		);
		expect(logged.mock.calls[0]?.[0]).toContain('mem-1');
		expect(logged.mock.calls[0]?.[0]).toContain('org-1');
	});
});
