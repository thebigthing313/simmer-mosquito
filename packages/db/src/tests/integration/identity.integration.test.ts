import { expect, it } from 'vitest';
import {
	clearOrganizationInvitationStamp,
	deactivateOrganizationMembershipWithTxid,
	readMembershipRemovalTarget,
	resolveActiveLocalAuthIdentity,
	stageOrganizationInvitation,
	stampOrganizationInvitation,
	upsertWorkOsIdentity,
} from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

describeDbIntegration('identity profile invitation lifecycle', () => {
	it('links an existing historical profile when the invited user signs in', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_historical_profile',
					name: 'Historical Profile District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const historicalProfile = await db
				.insertInto('profiles')
				.values({
					organization_id: organization.id,
					user_id: null,
					display_name: 'Casey Historical',
					email: null,
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const invitedMembership = await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				profileId: historicalProfile.id,
				email: 'casey.historical@example.test',
				displayName: null,
				role: 'manager',
				workosInvitationId: 'inv_historical_profile',
			});

			expect(invitedMembership).toMatchObject({
				organizationId: organization.id,
				profileId: historicalProfile.id,
				userId: null,
				role: 'manager',
				status: 'invited',
				invitedEmail: 'casey.historical@example.test',
				workosInvitationId: 'inv_historical_profile',
			});

			const localIdentity = await upsertWorkOsIdentity(db, {
				workosUserId: 'workos_user_historical_profile',
				email: 'casey.historical@example.test',
				displayName: 'Casey Historical',
				firstName: 'Casey',
				lastName: 'Historical',
				emailVerified: true,
				workosOrganizationId: 'workos_org_historical_profile',
				workosOrganizationName: 'Historical Profile District',
				workosRole: null,
			});

			expect(localIdentity).toMatchObject({
				organizationId: organization.id,
				profileId: historicalProfile.id,
				membershipId: invitedMembership.id,
				role: 'manager',
			});

			const profile = await db
				.selectFrom('profiles')
				.select(['id', 'user_id', 'email', 'display_name'])
				.where('id', '=', historicalProfile.id)
				.executeTakeFirstOrThrow();
			expect(profile).toMatchObject({
				id: historicalProfile.id,
				user_id: localIdentity.userId,
				email: 'casey.historical@example.test',
				display_name: 'Casey Historical',
			});

			const membership = await db
				.selectFrom('memberships')
				.select(['id', 'user_id', 'profile_id', 'role', 'status'])
				.where('id', '=', invitedMembership.id)
				.executeTakeFirstOrThrow();
			expect(membership).toMatchObject({
				id: invitedMembership.id,
				user_id: localIdentity.userId,
				profile_id: historicalProfile.id,
				role: 'manager',
				status: 'active',
			});

			const activeIdentity = await resolveActiveLocalAuthIdentity(db, {
				workosUserId: 'workos_user_historical_profile',
				workosOrganizationId: 'workos_org_historical_profile',
			});
			expect(activeIdentity?.profile.id).toBe(historicalProfile.id);
			expect(activeIdentity?.membership.id).toBe(invitedMembership.id);
			expect(activeIdentity?.membership.role).toBe('manager');
		});
	});
});

describeDbIntegration('ending an organization membership', () => {
	it('revokes access, and does not hand it back at the next sign-in', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_offboarding',
					name: 'Offboarding District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			// The owner exists so the departing member is not the last active one;
			// that refusal is asserted separately, as a pure rule.
			await upsertWorkOsIdentity(db, {
				workosUserId: 'workos_user_offboarding_owner',
				email: 'owner@example.test',
				displayName: 'Robin Owner',
				firstName: 'Robin',
				lastName: 'Owner',
				emailVerified: true,
				workosOrganizationId: 'workos_org_offboarding',
				workosOrganizationName: 'Offboarding District',
				workosRole: null,
			});

			const staged = await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				email: 'operator@simmer-data.test',
				displayName: 'Sam Operator',
				role: 'admin',
				workosInvitationId: 'inv_offboarding',
			});

			const signIn = async () =>
				upsertWorkOsIdentity(db, {
					workosUserId: 'workos_user_offboarding_operator',
					email: 'operator@simmer-data.test',
					displayName: 'Sam Operator',
					firstName: 'Sam',
					lastName: 'Operator',
					emailVerified: true,
					workosOrganizationId: 'workos_org_offboarding',
					workosOrganizationName: 'Offboarding District',
					workosRole: null,
				});

			const joined = await signIn();
			expect(joined).toMatchObject({ organizationId: organization.id, role: 'admin' });

			// The WorkOS id is the whole reason this read exists: WorkOS is where
			// the grant actually lives, and the membership row is the only place
			// the two systems are tied together.
			const target = await readMembershipRemovalTarget(db, {
				id: staged.id,
				organizationId: organization.id,
			});
			expect(target.membership).toMatchObject({
				role: 'admin',
				status: 'active',
				workosUserId: 'workos_user_offboarding_operator',
			});
			expect(target.activeOwnerCount).toBe(1);

			const ended = await deactivateOrganizationMembershipWithTxid(db, {
				id: staged.id,
				organizationId: organization.id,
			});
			expect(ended.row).toMatchObject({ status: 'inactive', isDefault: false });

			// The profile is untouched: it is what every row they created still
			// points at, and deleting it would take the attribution with it.
			const profile = await db
				.selectFrom('profiles')
				.select(['id', 'is_active', 'deleted_at'])
				.where('id', '=', staged.profileId)
				.executeTakeFirstOrThrow();
			expect(profile).toMatchObject({ is_active: true, deleted_at: null });

			await expect(
				resolveActiveLocalAuthIdentity(db, {
					workosUserId: 'workos_user_offboarding_operator',
					workosOrganizationId: 'workos_org_offboarding',
				}),
			).resolves.toBeNull();

			// The defect this lifecycle would otherwise have shipped with: sign-in
			// provisioning reused any existing membership and set it back to
			// `active`, so being removed lasted until the next sign-in.
			const afterRemoval = await signIn();
			expect(afterRemoval).toMatchObject({
				organizationId: null,
				membershipId: null,
				role: null,
			});

			const membership = await db
				.selectFrom('memberships')
				.select(['status', 'role', 'is_default'])
				.where('id', '=', staged.id)
				.executeTakeFirstOrThrow();
			expect(membership).toMatchObject({ status: 'inactive', role: 'admin', is_default: false });
		});
	});

	it('leaves another organization’s membership alone', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_scope_a', name: 'Scope A' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			const other = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_scope_b', name: 'Scope B' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const staged = await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				email: 'scoped@example.test',
				displayName: 'Scoped Member',
				role: 'viewer',
				workosInvitationId: 'inv_scope',
			});

			const result = await deactivateOrganizationMembershipWithTxid(db, {
				id: staged.id,
				organizationId: other.id,
			});

			expect(result.row).toBeNull();
			const untouched = await readMembershipRemovalTarget(db, {
				id: staged.id,
				organizationId: organization.id,
			});
			expect(untouched.membership).toMatchObject({ status: 'invited' });
		});
	});
});

// The two halves of #202's ordering. The row is written with no invitation id,
// because WorkOS must not mail a link before the row exists, and the id the send
// returned is stamped on afterwards.
describeDbIntegration('staging and stamping an invitation', () => {
	it('stamps a WorkOS invitation id onto a Membership staged without one', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_stamp',
					name: 'Stamp District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const staged = await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				email: 'stamp@example.test',
				displayName: 'Stamp Invitee',
				role: 'collector',
				workosInvitationId: null,
			});

			expect(staged).toMatchObject({
				status: 'invited',
				invitedEmail: 'stamp@example.test',
				workosInvitationId: null,
			});

			const stamped = await stampOrganizationInvitation(db, {
				id: staged.id,
				organizationId: organization.id,
				workosInvitationId: 'inv_stamped',
			});

			expect(stamped).toMatchObject({
				id: staged.id,
				status: 'invited',
				workosInvitationId: 'inv_stamped',
			});
		});
	});

	// #218: a re-invitation revokes before it sends, and between the two the row
	// must stop naming the link WorkOS no longer holds.
	it('clears the stamp of an invitation that was revoked', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_unstamp', name: 'Unstamp District' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const staged = await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				email: 'unstamp@example.test',
				displayName: 'Unstamp Invitee',
				role: 'collector',
				workosInvitationId: 'inv_revoked',
			});

			await clearOrganizationInvitationStamp(db, {
				id: staged.id,
				organizationId: organization.id,
			});

			const row = await db
				.selectFrom('memberships')
				.select(['status', 'workos_invitation_id'])
				.where('id', '=', staged.id)
				.executeTakeFirstOrThrow();
			expect(row).toMatchObject({ status: 'invited', workos_invitation_id: null });
		});
	});

	it('refuses to clear the stamp of a Membership in another organization', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_unstamp_owner', name: 'Unstamp Owner' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			const other = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_unstamp_other', name: 'Unstamp Other' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const staged = await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				email: 'unstamp.scope@example.test',
				displayName: 'Scoped Unstamp',
				role: 'viewer',
				workosInvitationId: 'inv_other_org',
			});

			await expect(
				clearOrganizationInvitationStamp(db, { id: staged.id, organizationId: other.id }),
			).rejects.toThrow();

			const untouched = await db
				.selectFrom('memberships')
				.select('workos_invitation_id')
				.where('id', '=', staged.id)
				.executeTakeFirstOrThrow();
			expect(untouched.workos_invitation_id).toBe('inv_other_org');
		});
	});

	it('refuses to stamp a Membership in another organization', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_stamp_owner', name: 'Stamp Owner' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			const other = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_stamp_other', name: 'Stamp Other' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const staged = await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				email: 'stamp.scope@example.test',
				displayName: 'Scoped Invitee',
				role: 'viewer',
				workosInvitationId: null,
			});

			await expect(
				stampOrganizationInvitation(db, {
					id: staged.id,
					organizationId: other.id,
					workosInvitationId: 'inv_wrong_org',
				}),
			).rejects.toThrow();

			const untouched = await readMembershipRemovalTarget(db, {
				id: staged.id,
				organizationId: organization.id,
			});
			expect(untouched.membership).toMatchObject({ status: 'invited' });
		});
	});
	// Reordering the route so Postgres is written before WorkOS made this refusal
	// load-bearing. Without it the insert branch stages a second Profile and a
	// second Membership beside the live one, and provisioning prefers the active
	// membership on every sign-in, so the invited row never leaves.
	it('refuses an address that already has active access', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_rejoin', name: 'Rejoin District' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			await stageOrganizationInvitation(db, {
				organizationId: organization.id,
				email: 'rejoin@example.test',
				displayName: 'Robin Rejoin',
				role: 'manager',
				workosInvitationId: null,
			});

			await upsertWorkOsIdentity(db, {
				workosUserId: 'workos_user_rejoin',
				email: 'rejoin@example.test',
				displayName: 'Robin Rejoin',
				firstName: 'Robin',
				lastName: 'Rejoin',
				emailVerified: true,
				workosOrganizationId: 'workos_org_rejoin',
				workosOrganizationName: 'Rejoin District',
				workosRole: null,
			});

			await expect(
				stageOrganizationInvitation(db, {
					organizationId: organization.id,
					email: 'rejoin@example.test',
					displayName: 'Robin Rejoin',
					role: 'admin',
					workosInvitationId: null,
				}),
			).rejects.toMatchObject({ code: 'already_a_member' });

			const profiles = await db
				.selectFrom('profiles')
				.select(['id'])
				.where('organization_id', '=', organization.id)
				.execute();
			expect(profiles).toHaveLength(1);
		});
	});
});
