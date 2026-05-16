import { expect, it } from 'vitest';
import {
	resolveActiveLocalAuthIdentity,
	stageOrganizationInvitation,
	upsertWorkOsIdentity,
} from './index.js';
import { describeDbIntegration, withTestDb } from './test-support/db-integration.js';

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
