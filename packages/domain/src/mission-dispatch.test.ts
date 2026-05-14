import { describe, expect, it } from 'vitest';
import { DomainValidationError } from './shared.js';
import {
	addMissionItemCommand,
	addMissionItemFromRequestedControlActionCommand,
	cancelMissionCommand,
	completeMissionCommand,
	createMissionCommand,
	deriveMissionItemStatus,
	deriveMissionLifecycleStatus,
	moveMissionItemsCommand,
	recordChemicalApplicationForMissionItemCommand,
	recordOutreachActionForMissionItemCommand,
	reopenMissionCommand,
	skipMissionItemCommand,
	updateMissionItemLocationAndLinkCommand,
	updateMissionPlanCommand,
	updateMissionScheduleCommand,
} from './mission-dispatch.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const missionId = '33333333-3333-4333-8333-333333333333';
const missionItemId = '44444444-4444-4444-8444-444444444444';
const missionItemId2 = '45454545-4545-4454-8454-454545454545';
const requestedControlActionId = '55555555-5555-4555-8555-555555555555';
const requestedControlActionId2 = '56565656-5656-4565-8565-565656565656';
const addressId = '66666666-6666-4666-8666-666666666666';
const profileId = '77777777-7777-4777-8777-777777777777';
const methodId = '88888888-8888-4888-8888-888888888888';
const notificationTypeId = '99999999-9999-4999-8999-999999999999';
const applicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const insecticideId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const unitId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const applicationBatchId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const insecticideBatchId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const outreachActionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const inspectionId = '12121212-1212-4212-8212-121212121212';
const cancellationCommentId = '13131313-1313-4313-8313-131313131313';
const reopenCommentId = '14141414-1414-4414-8414-141414141414';

const pointGeometry = { type: 'Point' as const, coordinates: [-90, 35] as const };
const lineGeometry = {
	type: 'LineString' as const,
	coordinates: [
		[-90, 35],
		[-89.9, 35.1],
	] as const,
};
const polygonGeometry = {
	type: 'Polygon' as const,
	coordinates: [
		[
			[-90, 35],
			[-89.9, 35],
			[-89.9, 35.1],
			[-90, 35],
		],
	] as const,
};

describe('mission dispatch parent commands', () => {
	it('creates scheduled missions with optional initial items', () => {
		const scheduledStartAt = new Date('2026-05-12T12:00:00.000Z');
		const scheduledEndAt = new Date('2026-05-12T14:00:00.000Z');

		expect(
			createMissionCommand({
				organizationId,
				actorProfileId,
				missionId,
				missionName: '  North ULV ',
				controlType: 'application',
				plannedMethodId: methodId,
				assignedToProfileId: profileId,
				scheduledStartAt,
				scheduledEndAt,
				rainDate: '2026-05-13',
				notificationTypeId,
				items: [
					{
						kind: 'explicit',
						missionItemId,
						geometry: polygonGeometry,
						addressId,
						requestedControlActionId,
					},
					{
						kind: 'fromRequestedControlAction',
						missionItemId: missionItemId2,
						requestedControlActionId: requestedControlActionId2,
					},
				],
				acknowledgedMethodMismatch: true,
			}).payload,
		).toMatchObject({
			missionId,
			missionName: 'North ULV',
			controlType: 'application',
			plannedMethodId: methodId,
			assignedToProfileId: profileId,
			scheduledStartAt,
			scheduledEndAt,
			rainDate: '2026-05-13',
			notificationTypeId,
			items: [
				{
					kind: 'explicit',
					missionItemId,
					geometry: polygonGeometry,
					addressId,
					requestedControlActionId,
				},
				{
					kind: 'fromRequestedControlAction',
					missionItemId: missionItemId2,
					requestedControlActionId: requestedControlActionId2,
				},
			],
			acknowledgedMethodMismatch: true,
		});
	});

	it('rejects duplicate initial mission item ids and invalid time windows', () => {
		expect(() =>
			createMissionCommand({
				organizationId,
				actorProfileId,
				missionId,
				controlType: 'application',
				scheduledStartAt: new Date('2026-05-12T12:00:00.000Z'),
				scheduledEndAt: new Date('2026-05-12T11:00:00.000Z'),
				items: [
					{ kind: 'explicit', missionItemId, geometry: pointGeometry },
					{ kind: 'fromRequestedControlAction', missionItemId, requestedControlActionId },
				],
			}),
		).toThrow(DomainValidationError);
	});

	it('builds guarded schedule and plan patches', () => {
		expect(
			updateMissionScheduleCommand({
				organizationId,
				actorProfileId,
				missionId,
				scheduledEndAt: null,
				rainDate: '2026-05-14',
				acknowledgedNotificationTimingChange: true,
			}).payload,
		).toMatchObject({
			changes: { scheduledEndAt: null, rainDate: '2026-05-14' },
			acknowledgedNotificationTimingChange: true,
		});

		expect(
			updateMissionPlanCommand({
				organizationId,
				actorProfileId,
				missionId,
				controlType: 'outreach',
				plannedMethodId: null,
			}).payload.changes,
		).toEqual({ controlType: 'outreach', plannedMethodId: null });

		expect(() =>
			updateMissionPlanCommand({ organizationId, actorProfileId, missionId }),
		).toThrow(DomainValidationError);
	});

	it('builds lifecycle commands with comments where required', () => {
		const cancelledAt = new Date('2026-05-12T13:00:00.000Z');

		expect(
			cancelMissionCommand({
				organizationId,
				actorProfileId,
				missionId,
				cancellationCommentId,
				cancellationReason: '  Weather moved in ',
				cancelledAt,
				acknowledgedPartialWorkCancellation: true,
			}).payload,
		).toMatchObject({
			cancellationCommentId,
			cancellationReason: 'Weather moved in',
			cancelledAt,
			acknowledgedPartialWorkCancellation: true,
		});

		expect(
			reopenMissionCommand({
				organizationId,
				actorProfileId,
				missionId,
				reopenCommentId,
				reopenReason: ' Rescheduled after supervisor review ',
			}).payload,
		).toMatchObject({
			reopenCommentId,
			reopenReason: 'Rescheduled after supervisor review',
		});

		expect(
			completeMissionCommand({ organizationId, actorProfileId, missionId }).payload.autoStartMission,
		).toBe(true);
	});
});

describe('mission dispatch item commands', () => {
	it('adds explicit and requested-action mission items with placement', () => {
		expect(
			addMissionItemCommand({
				organizationId,
				actorProfileId,
				missionItemId,
				missionId,
				geometry: lineGeometry,
				addressId,
				requestedControlActionId,
				placement: { kind: 'after', missionItemId: missionItemId2 },
				acknowledgedNotificationGeometryChange: true,
			}).payload,
		).toMatchObject({
			geometry: lineGeometry,
			addressId,
			requestedControlActionId,
			placement: { kind: 'after', missionItemId: missionItemId2 },
			acknowledgedNotificationGeometryChange: true,
		});

		expect(
			addMissionItemFromRequestedControlActionCommand({
				organizationId,
				actorProfileId,
				missionItemId,
				missionId,
				requestedControlActionId,
			}).payload.placement,
		).toEqual({ kind: 'end' });
	});

	it('builds item location/link patches and movement commands', () => {
		expect(
			updateMissionItemLocationAndLinkCommand({
				organizationId,
				actorProfileId,
				missionItemId,
				addressId: null,
				requestedControlActionId: requestedControlActionId2,
				acknowledgedProgressedItemLinkChange: true,
			}).payload,
		).toMatchObject({
			changes: { addressId: null, requestedControlActionId: requestedControlActionId2 },
			acknowledgedProgressedItemLinkChange: true,
		});

		expect(
			moveMissionItemsCommand({
				organizationId,
				actorProfileId,
				missionId,
				missionItemIds: [missionItemId, missionItemId2],
				placement: { kind: 'start' },
			}).payload.missionItemIds,
		).toEqual([missionItemId, missionItemId2]);

		expect(() =>
			moveMissionItemsCommand({
				organizationId,
				actorProfileId,
				missionId,
				missionItemIds: [missionItemId, missionItemId],
				placement: { kind: 'end' },
			}),
		).toThrow(DomainValidationError);
	});

	it('builds item progress commands with auto-start defaults', () => {
		expect(
			skipMissionItemCommand({
				organizationId,
				actorProfileId,
				missionItemId,
				skipReason: '  No access ',
			}).payload,
		).toMatchObject({
			skipReason: 'No access',
			skippedAt: null,
			autoStartMission: true,
			acknowledgedEarlyStart: false,
		});
	});
});

describe('mission dispatch execution helpers', () => {
	it('records chemical application intent for a mission item', () => {
		expect(
			recordChemicalApplicationForMissionItemCommand({
				organizationId,
				actorProfileId,
				missionItemId,
				applicationId,
				insecticideId,
				amountApplied: 1.5,
				applicationUnitId: unitId,
				applicationDate: '2026-05-12',
				geometry: polygonGeometry,
				addressId,
				requestedControlActionId,
				applicationBatches: [{ applicationBatchId, insecticideBatchId }],
				acknowledgedMissionGeometryNotCovered: true,
			}).payload,
		).toMatchObject({
			missionItemId,
			applicationId,
			insecticideId,
			amountApplied: 1.5,
			applicationUnitId: unitId,
			applicationDate: '2026-05-12',
			geometry: polygonGeometry,
			addressId,
			requestedControlActionId,
			applicationBatches: [{ applicationBatchId, insecticideBatchId }],
			completeMissionItem: true,
			autoStartMission: true,
			acknowledgedMissionGeometryNotCovered: true,
		});
	});

	it('rejects invalid helper context shapes', () => {
		expect(() =>
			recordOutreachActionForMissionItemCommand({
				organizationId,
				actorProfileId,
				missionItemId,
				outreachActionId,
				outreachDate: '2026-05-12',
				reach: 10,
				context: { kind: 'larval', habitatId: addressId },
			}),
		).toThrow(DomainValidationError);
	});

	it('accepts outreach inspection context and optional planned-method override', () => {
		expect(
			recordOutreachActionForMissionItemCommand({
				organizationId,
				actorProfileId,
				missionItemId,
				outreachActionId,
				outreachDate: '2026-05-12',
				outreachMethodId: methodId,
				reach: 10,
				reachDescription: ' Door hangers ',
				context: { kind: 'larval', inspectionId },
				completeMissionItem: false,
			}).payload,
		).toMatchObject({
			outreachMethodId: methodId,
			reach: 10,
			reachDescription: 'Door hangers',
			context: { kind: 'larval', inspectionId },
			completeMissionItem: false,
		});
	});
});

describe('mission dispatch status helpers', () => {
	it('derives mission and mission item statuses from timestamp shape', () => {
		expect(deriveMissionLifecycleStatus({})).toBe('scheduled');
		expect(deriveMissionLifecycleStatus({ startedAt: new Date() })).toBe('inProgress');
		expect(deriveMissionLifecycleStatus({ completedAt: new Date() })).toBe('completed');
		expect(deriveMissionLifecycleStatus({ cancelledAt: new Date() })).toBe('cancelled');
		expect(deriveMissionLifecycleStatus({ deletedAt: new Date(), completedAt: new Date() })).toBe(
			'deleted',
		);

		expect(deriveMissionItemStatus({})).toBe('pending');
		expect(deriveMissionItemStatus({ completedAt: new Date() })).toBe('completed');
		expect(deriveMissionItemStatus({ skippedAt: new Date() })).toBe('skipped');
		expect(deriveMissionItemStatus({ deletedAt: new Date(), skippedAt: new Date() })).toBe(
			'deleted',
		);
	});
});
