import { describe, expect, it } from 'vitest';
import { DomainValidationError } from './adult-surveillance.js';
import {
	addAssignmentItemCommand,
	addCommentCommand,
	addRouteItemCommand,
	assignTagCommand,
	createAssignmentFromRouteCommand,
	createTagCommand,
	moveAssignmentItemsCommand,
	moveRouteItemsCommand,
	selfAssignRouteCommand,
	skipAssignmentItemCommand,
	updateTagCommand,
} from './field-work.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const commentId = '33333333-3333-4333-8333-333333333333';
const tagId = '44444444-4444-4444-8444-444444444444';
const tagItemId = '55555555-5555-4555-8555-555555555555';
const routeId = '66666666-6666-4666-8666-666666666666';
const routeItemId = '77777777-7777-4777-8777-777777777777';
const routeItemId2 = '78787878-7878-4787-8787-787878787878';
const assignmentId = '88888888-8888-4888-8888-888888888888';
const assignmentItemId = '99999999-9999-4999-8999-999999999999';
const assignmentItemId2 = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const habitatId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const trapId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('field-work support commands', () => {
	it('normalizes comment target and text while preserving supplied comment time', () => {
		const commentedAt = new Date('2024-05-01T12:00:00.000Z');

		expect(
			addCommentCommand({
				organizationId,
				actorProfileId,
				commentId,
				target: { type: 'habitat', id: habitatId },
				commentText: '  Needs a ladder\nnext visit.  ',
				commentedAt,
			}),
		).toEqual({
			type: 'fieldWork.addComment',
			payload: {
				organizationId,
				actorProfileId,
				commentId,
				target: { type: 'habitat', id: habitatId },
				commentText: 'Needs a ladder\nnext visit.',
				commentedAt,
			},
		});
	});

	it('rejects unsupported targets for a support feature', () => {
		expect(() =>
			assignTagCommand({
				organizationId,
				actorProfileId,
				tagItemId,
				tagId,
				target: { type: 'collection' as never, id: habitatId },
			}),
		).toThrow(DomainValidationError);
	});

	it('normalizes tag color and patch clears nullable fields', () => {
		expect(
			createTagCommand({
				organizationId,
				actorProfileId,
				tagId,
				tagName: '  Priority ',
				description: '  Needs attention ',
				color: ' #FFAA00 ',
			}).payload,
		).toMatchObject({
			tagName: 'Priority',
			description: 'Needs attention',
			color: '#ffaa00',
		});

		expect(
			updateTagCommand({
				organizationId,
				actorProfileId,
				tagId,
				description: ' ',
				color: null,
			}).payload.changes,
		).toEqual({ description: null, color: null });
	});

	it('builds route item placement commands and rejects duplicate moves', () => {
		expect(
			addRouteItemCommand({
				organizationId,
				actorProfileId,
				routeItemId,
				routeId,
				target: { type: 'trap', id: trapId },
				placement: { kind: 'after', routeItemId: routeItemId2 },
				directionsToNextItem: '  Turn right at gate. ',
			}).payload,
		).toMatchObject({
			target: { type: 'trap', id: trapId },
			placement: { kind: 'after', routeItemId: routeItemId2 },
			directionsToNextItem: 'Turn right at gate.',
		});

		expect(() =>
			moveRouteItemsCommand({
				organizationId,
				actorProfileId,
				routeId,
				routeItemIds: [routeItemId, routeItemId],
				placement: { kind: 'end' },
			}),
		).toThrow(DomainValidationError);
	});

	it('normalizes assignment route snapshot mappings and rejects duplicates', () => {
		expect(
			createAssignmentFromRouteCommand({
				organizationId,
				actorProfileId,
				assignmentId,
				routeId,
				assignmentDate: '2026-05-11',
				assignmentItemIds: [{ routeItemId, assignmentItemId }],
				assignmentName: '  North route ',
			}).payload,
		).toMatchObject({
			assignmentDate: '2026-05-11',
			assignmentName: 'North route',
			routeId,
			assignmentItemIds: [{ routeItemId, assignmentItemId }],
		});

		expect(() =>
			selfAssignRouteCommand({
				organizationId,
				actorProfileId,
				assignmentId,
				routeId,
				assignmentItemIds: [
					{ routeItemId, assignmentItemId },
					{ routeItemId, assignmentItemId: assignmentItemId2 },
				],
			}),
		).toThrow(DomainValidationError);
	});

	it('builds mixed assignment item movement and progress commands', () => {
		expect(
			addAssignmentItemCommand({
				organizationId,
				actorProfileId,
				assignmentItemId,
				assignmentId,
				target: { type: 'serviceRequest', id: habitatId },
			}).payload,
		).toMatchObject({
			target: { type: 'serviceRequest', id: habitatId },
			placement: { kind: 'end' },
			directionsToNextItem: null,
		});

		expect(
			moveAssignmentItemsCommand({
				organizationId,
				actorProfileId,
				assignmentId,
				assignmentItemIds: [assignmentItemId, assignmentItemId2],
				placement: { kind: 'start' },
			}).payload.assignmentItemIds,
		).toEqual([assignmentItemId, assignmentItemId2]);

		expect(
			skipAssignmentItemCommand({
				organizationId,
				actorProfileId,
				assignmentItemId,
				skipReason: '  No access ',
			}).payload,
		).toMatchObject({ assignmentItemId, skippedAt: null, skipReason: 'No access' });
	});
});
