import type { SimmerRole } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { authorizeCommands, decideCommand, readCommandPermission } from './command-permissions.js';
import { registerFieldWorkCommandRoutes } from './field-work-commands/index.js';

describe('decideCommand', () => {
	it('lets manager-and-above through every command', () => {
		for (const role of ['owner', 'admin', 'manager'] as const) {
			expect(decideCommand(role, readCommandPermission('fieldWork.moveRouteItems'))).toBe('allow');
			expect(decideCommand(role, readCommandPermission('missionDispatch.deleteMission'))).toBe(
				'allow',
			);
			expect(decideCommand(role, readCommandPermission('fieldWork.completeAssignmentItem'))).toBe(
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
			expect(decideCommand('viewer', readCommandPermission(type))).toBe('deny');
		}
	});

	it('gives collectors field entry but not planning', () => {
		expect(decideCommand('collector', readCommandPermission('fieldWork.addComment'))).toBe('allow');
		expect(decideCommand('collector', readCommandPermission('fieldWork.assignTag'))).toBe('allow');
		expect(
			decideCommand('collector', readCommandPermission('fieldWork.addAdditionalPersonnel')),
		).toBe('allow');
		expect(decideCommand('collector', readCommandPermission('fieldWork.selfAssignRoute'))).toBe(
			'allow',
		);

		expect(decideCommand('collector', readCommandPermission('fieldWork.moveRouteItems'))).toBe(
			'deny',
		);
		expect(decideCommand('collector', readCommandPermission('fieldWork.createAssignment'))).toBe(
			'deny',
		);
		expect(decideCommand('collector', readCommandPermission('fieldWork.reopenAssignment'))).toBe(
			'deny',
		);
		expect(decideCommand('collector', readCommandPermission('fieldWork.createTag'))).toBe('deny');
		expect(decideCommand('collector', readCommandPermission('missionDispatch.createMission'))).toBe(
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
			expect(decideCommand('collector', readCommandPermission(type))).toBe('ownership');
		}

		// Editing a comment is the author-window version of the same deferral.
		expect(decideCommand('collector', readCommandPermission('fieldWork.updateComment'))).toBe(
			'ownership',
		);
		expect(decideCommand('collector', readCommandPermission('fieldWork.pinComment'))).toBe('deny');
	});
});

describe('authorizeCommands', () => {
	it('denies the whole batch when any one command is refused', () => {
		const batch = [
			{ type: 'fieldWork.addComment' } as const,
			{ type: 'fieldWork.createTag' } as const,
		];

		expect(authorizeCommands('manager', batch)).toBeNull();
		expect(authorizeCommands('collector', batch)).toMatchObject({ error: 'forbidden' });
	});

	it('explains a viewer refusal as read-only access', () => {
		expect(authorizeCommands('viewer', [{ type: 'fieldWork.addComment' }])).toMatchObject({
			error: 'forbidden',
			reason: 'Viewers have read-only access.',
		});
	});
});

describe('field-work endpoints', () => {
	// The reported bug: a signed-in Viewer reordered a habitat route's stops and
	// the write went through, persisting across a hard reload.
	it('refuses a viewer reordering route stops without touching the database', async () => {
		const response = await request('viewer', '/field-work/routes/' + routeId + '/move-items', {
			routeItemIds: [routeItemId],
			placement: { kind: 'start' },
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});

	it('refuses a collector reordering route stops', async () => {
		const response = await request('collector', '/field-work/routes/' + routeId + '/move-items', {
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

const routeId = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';
const routeItemId = 'c8d3f1b5-7a1f-4d4a-8e2f-7b5b5c8d0e32';
const commentId = 'd9e4a2c6-8b2a-4e5b-9f3a-8c6c6d9e1f43';
const habitatId = 'ea5b3d7f-9c3b-4f6c-8a4b-9d7d7eaf2a54';

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
