/**
 * What an invitation carries, which is two client-minted ids and an address.
 *
 * The ids are the whole of why `identity.invite` may be retried at all: a second
 * attempt collides on the primary key, and the server answers with the row it
 * already wrote instead of mailing a second link. Sending the wrong Profile id is
 * the failure that does not look like one — the invitation still works, and the
 * agency ends up with two people where it records one.
 */

import { describe, expect, it } from 'vitest';
import { inviteCommandBody } from '../../../../hooks/mutations/use-membership-mutations';

const PICKED_PROFILE = 'profile-7';

describe('an invitation body', () => {
	// The reason the invite sheet offers a list of historical Profiles at all.
	// Minting a fresh id here splits somebody's field history in two.
	it('attaches the login to the Profile the dialog picked', () => {
		const body = inviteCommandBody(
			{
				email: 'crew@agency.test',
				displayName: 'Sam Rivera',
				role: 'collector',
				profileId: PICKED_PROFILE,
			},
			minter(),
		);

		expect(body).toMatchObject({
			intents: ['identity.invite'],
			id: 'minted-1',
			profile_id: PICKED_PROFILE,
			invited_email: 'crew@agency.test',
			display_name: 'Sam Rivera',
			role: 'collector',
		});
	});

	it('mints a Profile id when the invite is for somebody new', () => {
		const body = inviteCommandBody(
			{ email: 'crew@agency.test', displayName: '', role: 'viewer', profileId: null },
			minter(),
		);

		expect(body).toMatchObject({ id: 'minted-1', profile_id: 'minted-2' });
	});

	// Column names, because the server reads `snake_case` keys as columns of the
	// record being written. A camelCase spelling compiles, reads `undefined`, and
	// answers 400 for a field the dialog did supply.
	it('names the columns rather than the dialog fields', () => {
		const body = inviteCommandBody(
			{ email: 'crew@agency.test', displayName: 'Sam', role: 'viewer', profileId: null },
			minter(),
		);

		expect(Object.keys(body).sort()).toEqual([
			'display_name',
			'id',
			'intents',
			'invited_email',
			'profile_id',
			'role',
		]);
	});
});

function minter(): () => string {
	let issued = 0;
	return () => {
		issued += 1;
		return `minted-${issued}`;
	};
}
