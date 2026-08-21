/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthMe } from '../../../../auth';
import type { PersonListing } from '../../../../hooks/queries/use-people-directory';

/**
 * What the People page shows when a write to `/commands/memberships` is refused.
 *
 * Every one of the four `identity.*` commands can fail for a reason nobody wrote
 * a bug for: WorkOS unreachable, an address already invited, a role the ladder
 * refuses. Re-inviting somebody shipped reporting that only through a toast, so
 * a 502 left the sheet reading exactly as it had a moment earlier and the person
 * driving it believing the mail went (#219).
 *
 * These drive the two controls that sit under the edit sheet rather than in its
 * form. The sheet stays open through both, which is why the reason has to land
 * on it: there is no navigation, no closed dialog, nothing else that would tell
 * a refusal from a success.
 */

const reinvite = vi.fn();
const endMembership = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({
	toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));
vi.mock('../../../../hooks/mutations/use-membership-mutations', () => ({
	useMembershipMutations: () => ({ reinvite, endMembership }),
}));

const { ReinviteControl } = await import('../../../../routes/my-organization/-components/reinvite');
const { RemoveMemberControl } = await import(
	'../../../../routes/my-organization/-components/remove-member'
);

const INVITED_PERSON = {
	displayName: 'Sam Rivera',
	email: 'crew@agency.test',
	membershipId: 'membership_2',
	membershipStatus: 'invited',
	role: 'collector',
} as unknown as PersonListing;

const OWNER: AuthMe = {
	authenticated: true,
	user: {
		workosUserId: 'user_1',
		email: 'owner@agency.test',
		firstName: null,
		lastName: null,
		displayName: 'Owner',
		emailVerified: true,
		profilePictureUrl: null,
	},
	workosOrganizationId: 'org_1',
	localIdentity: {
		userId: 'user_1',
		organizationId: 'org_1',
		profileId: 'profile_1',
		membershipId: 'membership_1',
		role: 'owner',
	},
};

beforeAll(() => {
	// jsdom ships none of the layout APIs Radix reaches for. These assert copy,
	// never geometry.
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(cleanup);

describe('a refused re-invitation', () => {
	it('says why, where the control that asked for it is', async () => {
		reinvite.mockRejectedValue(new Error('Email already invited to organization.'));
		render(<ReinviteControl person={INVITED_PERSON} />);

		await confirmAction('Send New Invitation');

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe('Email already invited to organization.'),
		);
		expect(toastError).toHaveBeenCalledWith('Email already invited to organization.');
	});

	// A thrown value with nothing on it reads as the generic save message, which
	// on this control would tell the reader a profile edit failed.
	it('names the send when the refusal carries no reason of its own', async () => {
		reinvite.mockRejectedValue('no message');
		render(<ReinviteControl person={INVITED_PERSON} />);

		await confirmAction('Send New Invitation');

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe('The new invitation was not sent.'),
		);
	});

	it('clears the last refusal when the send is tried again', async () => {
		reinvite.mockRejectedValueOnce(new Error('WorkOS is unreachable.'));
		render(<ReinviteControl person={INVITED_PERSON} />);

		await confirmAction('Send New Invitation');
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

		reinvite.mockResolvedValueOnce(undefined);
		await confirmAction('Send New Invitation');

		await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

describe('a refused offboarding', () => {
	it('says why, and leaves the sheet where it was', async () => {
		endMembership.mockRejectedValue(new Error('Only an owner may remove an admin.'));
		const onRemoved = vi.fn();
		render(<RemoveMemberControl auth={OWNER} onRemoved={onRemoved} person={INVITED_PERSON} />);

		await confirmAction('Remove Access');

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe('Only an owner may remove an admin.'),
		);
		expect(onRemoved).not.toHaveBeenCalled();
	});

	it('names the person when the refusal carries no reason of its own', async () => {
		endMembership.mockRejectedValue('no message');
		render(<RemoveMemberControl auth={OWNER} onRemoved={vi.fn()} person={INVITED_PERSON} />);

		await confirmAction('Remove Access');

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toBe('Sam Rivera still has access.'),
		);
	});
});

/**
 * Open the control's confirmation and press the button that carries the write.
 *
 * The trigger and the confirming button read the same, deliberately, so the
 * dialog is what tells them apart: an open Radix dialog marks everything behind
 * it `aria-hidden`, which takes the trigger out of every role query.
 */
async function confirmAction(label: string): Promise<void> {
	fireEvent.click(screen.getByRole('button', { name: label }));
	await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());
	fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: label }));
}
