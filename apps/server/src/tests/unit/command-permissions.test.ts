import type { SimmerRole } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import { registerAdultSurveillanceCommandRoutes } from '../../adult-surveillance-commands/index.js';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import {
	authorizeCommands,
	type CommandPermission,
	decideCommand,
	denyUnauthorizedCommandType,
	type OrganizationCommandType,
	readCommandPermission,
} from '../../command-permissions.js';
import { registerFieldWorkCommandRoutes } from '../../field-work-commands/index.js';
import { registerFoundationGeographyCommandRoutes } from '../../foundation-geography-commands/index.js';
import { registerLarvalSurveillanceCommandRoutes } from '../../larval-surveillance-commands/index.js';
import { registerPublicEngagementRecordRoutes } from '../../public-engagement-records-commands/index.js';
import type { ForbiddenBody } from '../../roles.js';

/**
 * The agency half of a scope, which is what almost every case here is about.
 *
 * `decideCommand` takes a role *and* whether the session is SIMMER's own,
 * because `admin` cannot separate an operator from an agency administrator —
 * they hold the same membership role. These two wrappers keep the role-ladder
 * cases reading as role-ladder cases; the operator arm is exercised directly.
 */
function decideAsRole(role: SimmerRole, permission: CommandPermission) {
	return decideCommand({ role, isOperator: false }, permission);
}

function authorizeAsRole(
	role: SimmerRole,
	commands: readonly { readonly type: OrganizationCommandType }[],
) {
	return authorizeCommands({ role, isOperator: false }, commands);
}

describe('the operator floor', () => {
	const TAXONOMY = [
		'foundation.createGenus',
		'foundation.updateGenus',
		'foundation.deleteGenus',
		'foundation.createSpecies',
		'foundation.updateSpecies',
		'foundation.deleteSpecies',
	] as const;

	it('refuses every agency role, including the highest', () => {
		// `genera` and `species` have no `organization_id` — one agency's owner
		// editing them changes what every other agency reads. The role ladder has
		// no height that should reach this, which is the whole reason the rule is
		// not a role.
		for (const type of TAXONOMY) {
			for (const role of ['owner', 'admin', 'manager', 'collector', 'viewer'] as const) {
				expect({ type, role, decision: decideAsRole(role, readCommandPermission(type)) }).toEqual({
					type,
					role,
					decision: 'deny',
				});
			}
		}
	});

	it('allows an operator whatever their agency role is', () => {
		// Operators hold an ordinary membership so their work is attributable
		// (ADR 0011), and it is beside the point here.
		for (const role of ['admin', 'viewer'] as const) {
			expect(
				decideCommand(
					{ role, isOperator: true },
					readCommandPermission('foundation.createSpecies'),
				),
			).toBe('allow');
		}
	});

	it('does not tell a refused agency admin that their role is too low', () => {
		// It is not, and there is no higher one to go looking for.
		const denial = authorizeAsRole('owner', [{ type: 'foundation.createSpecies' }]);

		expect(denial?.reason).toContain('operator');
		expect(denial?.reason).not.toContain('role');
	});

	it('leaves the agency foundation commands on the role ladder', () => {
		// The six taxonomy commands moved; the other thirty did not.
		expect(decideAsRole('admin', readCommandPermission('foundation.createCollectionMethod'))).toBe(
			'allow',
		);
		expect(decideAsRole('collector', readCommandPermission('foundation.createAddress'))).toBe(
			'allow',
		);
	});
});

describe('decideCommand', () => {
	it('lets manager-and-above through every command', () => {
		for (const role of ['owner', 'admin', 'manager'] as const) {
			expect(decideAsRole(role, readCommandPermission('fieldWork.moveRouteItems'))).toBe('allow');
			expect(decideAsRole(role, readCommandPermission('missionDispatch.deleteMission'))).toBe(
				'allow',
			);
			expect(decideAsRole(role, readCommandPermission('fieldWork.completeAssignmentItem'))).toBe(
				'allow',
			);
		}
	});

	it('refuses viewers everything, including field entry', () => {
		for (const type of [
			'fieldWork.addComment',
			'fieldWork.assignTag',
			'fieldWork.moveRouteItems',
			'fieldWork.completeAssignmentItem',
			'missionDispatch.startMission',
		] as const) {
			expect(decideAsRole('viewer', readCommandPermission(type))).toBe('deny');
		}
	});

	it('gives collectors field entry but not planning', () => {
		expect(decideAsRole('collector', readCommandPermission('fieldWork.addComment'))).toBe('allow');
		expect(decideAsRole('collector', readCommandPermission('fieldWork.assignTag'))).toBe('allow');
		expect(
			decideAsRole('collector', readCommandPermission('fieldWork.addAdditionalPersonnel')),
		).toBe('allow');
		expect(decideAsRole('collector', readCommandPermission('fieldWork.selfAssignRoute'))).toBe(
			'allow',
		);

		expect(decideAsRole('collector', readCommandPermission('fieldWork.moveRouteItems'))).toBe(
			'deny',
		);
		expect(decideAsRole('collector', readCommandPermission('fieldWork.createAssignment'))).toBe(
			'deny',
		);
		expect(decideAsRole('collector', readCommandPermission('fieldWork.reopenAssignment'))).toBe(
			'deny',
		);
		expect(decideAsRole('collector', readCommandPermission('fieldWork.createTag'))).toBe('deny');
		expect(decideAsRole('collector', readCommandPermission('missionDispatch.createMission'))).toBe(
			'deny',
		);
	});

	it('defers a collector executing work to the ownership check', () => {
		for (const type of [
			'fieldWork.startAssignment',
			'fieldWork.completeAssignment',
			'fieldWork.completeAssignmentItem',
			'fieldWork.skipAssignmentItem',
			'missionDispatch.startMission',
			'missionDispatch.recordChemicalApplicationForMissionItem',
		] as const) {
			expect(decideAsRole('collector', readCommandPermission(type))).toBe('ownership');
		}

		// Editing a comment is the author-window version of the same deferral.
		expect(decideAsRole('collector', readCommandPermission('fieldWork.updateComment'))).toBe(
			'ownership',
		);
		expect(decideAsRole('collector', readCommandPermission('fieldWork.pinComment'))).toBe('deny');
	});
});

describe('decideCommand across the other agency domains', () => {
	it('refuses a viewer every write in every domain', () => {
		for (const type of [
			'foundation.createAddress',
			'foundation.createCollectionMethod',
			'larvalSurveillance.recordHabitatInspection',
			'larvalSurveillance.addSampleSpeciesCount',
			'adultSurveillance.collectCollection',
			'adultSurveillance.createTrap',
			'controlOperations.recordChemicalApplication',
			'controlOperations.createInsecticide',
			'publicEngagement.createServiceRequest',
			'publicEngagement.createNotificationType',
		] as const) {
			expect(decideAsRole('viewer', readCommandPermission(type))).toBe('deny');
		}
	});

	// The rung that did not exist before: "lookup management is owner/admin
	// only", "insecticides: owner/admin", "formulations/components: owner/admin",
	// "notification type catalog management is owner/admin only".
	it('keeps a manager out of the owner/admin catalogs', () => {
		for (const type of [
			'foundation.createCollectionMethod',
			'foundation.deleteCollectionLure',
			'foundation.deactivateHabitatType',
			'foundation.selectOrganizationSpecies',
			'controlOperations.createInsecticide',
			'controlOperations.createFormulation',
			'controlOperations.addFormulationInsecticide',
			'controlOperations.deactivateApplicationMethod',
			'publicEngagement.createNotificationType',
		] as const) {
			expect(decideAsRole('manager', readCommandPermission(type))).toBe('deny');
			expect(decideAsRole('admin', readCommandPermission(type))).toBe('allow');
			expect(decideAsRole('owner', readCommandPermission(type))).toBe('allow');
		}
	});

	// "managers update name/schema" sits one rung below the rest of the method
	// catalog, and vehicles/equipment/batches are manager-and-above outright.
	it('leaves managers the parts of the catalog the doc gives them', () => {
		for (const type of [
			'controlOperations.updateApplicationMethod',
			'controlOperations.updateBiocontrolMethod',
			'controlOperations.createVehicle',
			'controlOperations.deleteEquipment',
			'controlOperations.createInsecticideBatch',
			'foundation.createRegion',
			'foundation.deleteRegionFolder',
		] as const) {
			expect(decideAsRole('manager', readCommandPermission(type))).toBe('allow');
			expect(decideAsRole('collector', readCommandPermission(type))).toBe('deny');
		}
	});

	it('gives collectors surveillance entry and the named habitat exceptions', () => {
		for (const type of [
			'larvalSurveillance.recordHabitatInspection',
			'larvalSurveillance.recordAdHocInspection',
			'larvalSurveillance.deleteInspection',
			'larvalSurveillance.addInspectionSample',
			'larvalSurveillance.addSampleSpeciesCount',
			'larvalSurveillance.updateHabitatDetails',
			'larvalSurveillance.markHabitatInaccessible',
			'larvalSurveillance.createHabitatFromInspection',
			'adultSurveillance.setTrapCollection',
			'adultSurveillance.collectCollection',
			'adultSurveillance.deleteCollection',
			'adultSurveillance.addCollectionSpeciesCount',
			'foundation.createAddress',
		] as const) {
			expect(decideAsRole('collector', readCommandPermission(type))).toBe('allow');
		}

		// The rest of the habitat and trap catalog stays supervisory.
		for (const type of [
			'larvalSurveillance.createHabitat',
			'larvalSurveillance.retireHabitat',
			'larvalSurveillance.mergeHabitats',
			'larvalSurveillance.updateHabitatLocation',
			'adultSurveillance.createTrap',
			'adultSurveillance.retireTrap',
			'foundation.updateAddressDetails',
			'foundation.deleteAddress',
		] as const) {
			expect(decideAsRole('collector', readCommandPermission(type))).toBe('deny');
		}
	});

	// "collector: no public engagement management commands".
	it('gives collectors nothing in public engagement', () => {
		for (const type of [
			'publicEngagement.createContact',
			'publicEngagement.createServiceRequest',
			'publicEngagement.closeServiceRequest',
			'publicEngagement.createNotificationRegistration',
			'publicEngagement.generateMissionNotifications',
		] as const) {
			expect(decideAsRole('collector', readCommandPermission(type))).toBe('deny');
		}
	});

	it('defers a collector correcting a control action they may have performed', () => {
		for (const type of [
			'controlOperations.updateChemicalApplicationFieldDetails',
			'controlOperations.updateChemicalApplicationLocationAndContext',
			'controlOperations.addChemicalApplicationBatch',
			'controlOperations.removeChemicalApplicationBatch',
			'controlOperations.updateSourceReductionFieldDetails',
			'controlOperations.updateOutreachActionFieldDetails',
			'controlOperations.updateBiocontrolActionFieldDetails',
			'controlOperations.updateRequestedControlActionDetails',
		] as const) {
			expect(decideAsRole('collector', readCommandPermission(type))).toBe('ownership');
			expect(decideAsRole('manager', readCommandPermission(type))).toBe('allow');
			expect(decideAsRole('viewer', readCommandPermission(type))).toBe('deny');
		}

		// Recording is unconditional.
		expect(
			decideAsRole(
				'collector',
				readCommandPermission('controlOperations.recordChemicalApplication'),
			),
		).toBe('allow');
		// Resolution is supervisory outright — no row can make it a collector's.
		expect(
			decideAsRole(
				'collector',
				readCommandPermission('controlOperations.resolveRequestedControlAction'),
			),
		).toBe('deny');
	});

	it('leaves the action deletes to the row, not to the role', () => {
		// A collector's own recent standalone record is theirs to remove; the same
		// command on one with support rows, batch links, or a linked request is a
		// manager's. Neither answer is available from the role, so all five defer.
		for (const type of [
			'controlOperations.deleteChemicalApplication',
			'controlOperations.deleteSourceReduction',
			'controlOperations.deleteOutreachAction',
			'controlOperations.deleteBiocontrolAction',
			'controlOperations.deleteRequestedControlAction',
		] as const) {
			expect(decideAsRole('collector', readCommandPermission(type))).toBe('ownership');
			expect(decideAsRole('manager', readCommandPermission(type))).toBe('allow');
			expect(decideAsRole('viewer', readCommandPermission(type))).toBe('deny');
		}
	});
});

describe('authorizeCommands', () => {
	it('denies the whole batch when any one command is refused', () => {
		const batch = [
			{ type: 'fieldWork.addComment' } as const,
			{ type: 'fieldWork.createTag' } as const,
		];

		expect(authorizeAsRole('manager', batch)).toBeNull();
		expect(authorizeAsRole('collector', batch)).toMatchObject({ error: 'forbidden' });
	});

	it('explains a viewer refusal as read-only access', () => {
		expect(authorizeAsRole('viewer', [{ type: 'fieldWork.addComment' }])).toMatchObject({
			error: 'forbidden',
			reason: 'Viewers have read-only access.',
		});
	});
});

describe('denyUnauthorizedCommandType', () => {
	// The settings routes refuse before reading the body, so they ask by type
	// rather than by built command (#130).
	it('applies the floor the map declares for a settings command', () => {
		expect(denyFor('admin', 'organizationSettings.updateTimezone')).toBeNull();
		expect(denyFor('owner', 'organizationSettings.updateTimezone')).toBeNull();
		expect(denyFor('manager', 'organizationSettings.updateTimezone')).not.toBeNull();
		expect(denyFor('viewer', 'organizationSettings.updateSpeciesKeyBindings')).not.toBeNull();
	});

	// An ownership rule needs a stored row, so the door is the wrong place to
	// settle it — a collector must reach the transaction that can.
	it('does not refuse a collector an ownership rule would let through', () => {
		expect(denyFor('collector', 'fieldWork.startAssignment')).toBeNull();
		expect(denyFor('viewer', 'fieldWork.startAssignment')).not.toBeNull();
	});
});

/**
 * The floors the identity commands carry, and where they came from.
 *
 * `IDENTITY_FLOORS` in `roles.ts` held these as a parallel table until ADR 0013
 * was finished. Not one of them changed value on the way over; what changed is
 * that the map they landed in is exhaustive, so an identity command with no floor
 * no longer compiles.
 */
describe('the identity floors', () => {
	it('holds the three pure-Postgres writes at the floors they had as routes', () => {
		expect(denyFor('admin', 'identity.updateOrganizationDetails')).toBeNull();
		expect(denyFor('manager', 'identity.updateOrganizationDetails')).not.toBeNull();
		expect(denyFor('admin', 'identity.createProfile')).toBeNull();
		expect(denyFor('manager', 'identity.createProfile')).not.toBeNull();
		expect(denyFor('admin', 'identity.updateProfile')).toBeNull();
		expect(denyFor('manager', 'identity.updateProfile')).not.toBeNull();
	});

	it('holds the people floor at admin and the role floor at owner', () => {
		expect(denyFor('admin', 'identity.invite')).toBeNull();
		expect(denyFor('manager', 'identity.invite')).not.toBeNull();
		expect(denyFor('admin', 'identity.reinvite')).toBeNull();
		expect(denyFor('manager', 'identity.reinvite')).not.toBeNull();
		expect(denyFor('admin', 'identity.endMembership')).toBeNull();
		expect(denyFor('manager', 'identity.endMembership')).not.toBeNull();

		expect(denyFor('owner', 'identity.changeRole')).toBeNull();
		expect(denyFor('admin', 'identity.changeRole')).not.toBeNull();
	});
});

function denyFor(role: SimmerRole, type: OrganizationCommandType): Response | null {
	return denyUnauthorizedCommandType(refusalContext(role), type);
}

/** The guard takes only what it needs: the role, and a way to say no. */
function refusalContext(role: SimmerRole) {
	return {
		get: (_key: 'authContext') => ({ role }),
		json: (body: ForbiddenBody, status: 403) =>
			new Response(JSON.stringify(body), { status }) as Response,
	};
}

describe('field-work endpoints', () => {
	// The reported bug: a signed-in Viewer reordered a habitat route's stops and
	// the write went through, persisting across a hard reload.
	it('refuses a viewer reordering route stops without touching the database', async () => {
		const response = await request('viewer', `/field-work/routes/${routeId}/move-items`, {
			routeItemIds: [routeItemId],
			placement: { kind: 'start' },
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	it('refuses a collector reordering route stops', async () => {
		const response = await request('collector', `/field-work/routes/${routeId}/move-items`, {
			routeItemIds: [routeItemId],
			placement: { kind: 'start' },
		});

		expect(response.status).toBe(403);
	});

	it('refuses a viewer adding a comment', async () => {
		const response = await request('viewer', '/field-work/comments', {
			id: commentId,
			entityType: 'habitat',
			entityId: habitatId,
			commentText: 'Standing water at the north end.',
		});

		expect(response.status).toBe(403);
	});
});

// The gap #50 reported: these modules resolved `AuthContext` for organization
// scoping and never looked at the role, so every one of them accepted a
// viewer's write. `unusableDb` throws on `transaction()`, so each passing case
// also proves the refusal happens before the database is opened.
describe('agency endpoints outside field work', () => {
	// Deletes, because they carry no body: the role check runs after the command
	// is built, so a request that would have failed validation first would prove
	// nothing about the role.
	it.each([
		['viewer', `/larval-surveillance/habitats/${habitatId}`],
		['collector', `/larval-surveillance/habitats/${habitatId}`],
		['viewer', `/adult-surveillance/traps/${trapId}`],
		['collector', `/adult-surveillance/traps/${trapId}`],
		['viewer', `/foundation/regions/${regionId}`],
		['collector', `/foundation/regions/${regionId}`],
		['viewer', `/public-engagement/contacts/${contactId}`],
		['collector', `/public-engagement/contacts/${contactId}`],
	] as const)('refuses a %s deleting %s', async (role, path) => {
		const response = await requestOrganization(role, path);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});
});

const routeId = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';
const routeItemId = 'c8d3f1b5-7a1f-4d4a-8e2f-7b5b5c8d0e32';
const commentId = 'd9e4a2c6-8b2a-4e5b-9f3a-8c6c6d9e1f43';
const habitatId = 'ea5b3d7f-9c3b-4f6c-8a4b-9d7d7eaf2a54';
const trapId = 'fb6c4e80-ad4c-4a7d-9b5c-ae8e8fb03b65';
const regionId = '0c7d5f91-be5d-4b8e-8c6d-bf9f90c14c76';
const contactId = '1d8e6a02-cf6e-4c9f-9d7e-c0a0a1d25d87';

async function requestOrganization(role: SimmerRole, path: string): Promise<Response> {
	const app = new Hono<{ Variables: AuthVariables }>();
	const options = {
		db: unusableDb as never,
		authContextMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('authContext', authContextFor(role));
			await next();
		}),
	};
	registerLarvalSurveillanceCommandRoutes(app, options);
	registerAdultSurveillanceCommandRoutes(app, options);
	registerFoundationGeographyCommandRoutes(app, options);
	registerPublicEngagementRecordRoutes(app, options);

	return app.request(path, { method: 'DELETE' });
}

/**
 * Registers the real routes against a database that would throw if touched, so
 * a passing test also proves the refusal happened before any write.
 */
async function request(role: SimmerRole, path: string, body: unknown): Promise<Response> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerFieldWorkCommandRoutes(app, {
		db: unusableDb as never,
		authContextMiddleware: createMiddleware(async (context, next) => {
			context.set('authContext', authContextFor(role));
			await next();
		}),
	});

	return app.request(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

const unusableDb = {
	transaction: () => {
		throw new Error('The database must not be reached for an unauthorized command.');
	},
};

function authContextFor(role: SimmerRole): AuthContext {
	return {
		organization: { id: 'f0dbf1c7-d278-441e-82b4-9292d390ce72' },
		profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
		role,
	} as AuthContext;
}
