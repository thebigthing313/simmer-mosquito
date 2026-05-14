import { describe, expect, it } from 'vitest';
import { DomainValidationError } from './shared.js';
import {
	closeServiceRequestCommand,
	createContactCommand,
	createNotificationRegistrationCommand,
	createNotificationTypeCommand,
	createServiceRequestCommand,
	generateMissionNotificationsCommand,
	mergeContactsCommand,
	reopenMissionNotificationCommand,
	subscribeNotificationRegistrationTypeCommand,
	updateContactCommunicationCommand,
	updateNotificationRegistrationBufferCommand,
	updateNotificationRegistrationFlagsCommand,
	updateNotificationRegistrationLocationCommand,
	updateNotificationTypeCommand,
	updateServiceRequestDetailsCommand,
} from './public-engagement.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';
const sourceContactId = '34343434-3434-4434-8434-343434343434';
const serviceRequestId = '44444444-4444-4444-8444-444444444444';
const addressId = '55555555-5555-4555-8555-555555555555';
const notificationTypeId = '66666666-6666-4666-8666-666666666666';
const notificationRegistrationId = '77777777-7777-4777-8777-777777777777';
const notificationRegistrationTypeId = '88888888-8888-4888-8888-888888888888';
const notificationRegistrationTypeId2 = '89898989-8989-4898-8989-898989898989';
const missionId = '99999999-9999-4999-8999-999999999999';
const missionNotificationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const resolutionCommentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const unitId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

describe('public engagement contact commands', () => {
	it('normalizes contact creation and notification preferences', () => {
		expect(
			createContactCommand({
				organizationId,
				actorProfileId,
				contactId,
				contactName: '  Ada Resident ',
				preferredPhone: ' 555-1212 ',
				alternatePhone: ' 555-3434 ',
				email: ' ADA@EXAMPLE.COM ',
				wantsEmail: true,
				wantsSms: true,
			}).payload,
		).toMatchObject({
			contactId,
			contactName: 'Ada Resident',
			preferredPhone: '555-1212',
			alternatePhone: '555-3434',
			email: 'ada@example.com',
			wantsEmail: true,
			wantsSms: true,
			wantsPhone: false,
		});

		expect(() =>
			createContactCommand({
				organizationId,
				actorProfileId,
				contactId,
				department: 'Leasing',
				title: 'Manager',
			}),
		).toThrow(DomainValidationError);

		expect(() =>
			createContactCommand({
				organizationId,
				actorProfileId,
				contactId,
				company: 'Apartments',
				alternatePhone: '555-3434',
			}),
		).toThrow(DomainValidationError);
	});

	it('builds guarded contact patches and acknowledged merges', () => {
		expect(
			updateContactCommunicationCommand({
				organizationId,
				actorProfileId,
				contactId,
				preferredPhone: '555-1212',
				wantsPhone: true,
			}).payload.changes,
		).toEqual({
			preferredPhone: '555-1212',
			wantsPhone: true,
		});

		expect(
			mergeContactsCommand({
				organizationId,
				actorProfileId,
				targetContactId: contactId,
				sourceContactIds: [sourceContactId],
				acknowledgedContactMerge: true,
			}).payload,
		).toMatchObject({
			targetContactId: contactId,
			sourceContactIds: [sourceContactId],
			acknowledgedContactMerge: true,
		});

		expect(() =>
			mergeContactsCommand({
				organizationId,
				actorProfileId,
				targetContactId: contactId,
				sourceContactIds: [contactId],
				acknowledgedContactMerge: true,
			}),
		).toThrow(DomainValidationError);
	});
});

describe('public engagement service request commands', () => {
	it('creates a service request with inline contact and address details', () => {
		expect(
			createServiceRequestCommand({
				organizationId,
				actorProfileId,
				serviceRequestId,
				contact: {
					kind: 'new',
					contactId,
					details: { company: 'Acme Apartments', preferredPhone: '555-1212' },
				},
				location: {
					address: {
						kind: 'new',
						addressId,
						details: {
							displayName: '  100 Main St ',
							geometry: pointGeometry,
							region: ' ar ',
							postalCode: '72001',
							geocoderResponse: { source: 'manual' },
						},
					},
					geometry: pointGeometry,
				},
				intakeType: 'walk-in',
				requestDate: '2026-05-11',
				details: ' Standing water in courtyard ',
			}).payload,
		).toMatchObject({
			serviceRequestId,
			intakeType: 'walk-in',
			requestDate: '2026-05-11',
			details: 'Standing water in courtyard',
			receivedByProfileId: actorProfileId,
			contact: { kind: 'new', contactId, details: { company: 'Acme Apartments' } },
			location: {
				address: {
					kind: 'new',
					addressId,
					details: { displayName: '100 Main St', region: 'AR' },
				},
				geometry: pointGeometry,
			},
		});
	});

	it('normalizes request detail and lifecycle commands', () => {
		expect(
			updateServiceRequestDetailsCommand({
				organizationId,
				actorProfileId,
				serviceRequestId,
				receivedByProfileId: null,
				details: ' Updated caller details ',
				acknowledgedClosedRequestChange: true,
			}).payload,
		).toMatchObject({
			serviceRequestId,
			changes: { receivedByProfileId: null, details: 'Updated caller details' },
			acknowledgedClosedRequestChange: true,
		});

		const closedAt = new Date('2026-05-11T15:00:00.000Z');
		expect(
			closeServiceRequestCommand({
				organizationId,
				actorProfileId,
				serviceRequestId,
				resolutionCommentId,
				resolutionSummary: ' Inspected and found no breeding. ',
				closedAt,
			}).payload,
		).toMatchObject({
			serviceRequestId,
			resolutionCommentId,
			resolutionSummary: 'Inspected and found no breeding.',
			closedAt,
		});

		expect(() =>
			closeServiceRequestCommand({
				organizationId,
				actorProfileId,
				serviceRequestId,
				resolutionCommentId,
				resolutionSummary: ' ',
			}),
		).toThrow(DomainValidationError);
	});
});

describe('public engagement notification commands', () => {
	it('normalizes notification type commands and acknowledgement flags', () => {
		expect(
			createNotificationTypeCommand({
				organizationId,
				actorProfileId,
				notificationTypeId,
				name: '  Adulticide mission ',
				description: '',
			}).payload,
		).toEqual({
			organizationId,
			actorProfileId,
			notificationTypeId,
			name: 'Adulticide mission',
			description: null,
		});

		expect(
			updateNotificationTypeCommand({
				organizationId,
				actorProfileId,
				notificationTypeId,
				name: 'Spray notice',
				acknowledgedHistoricalLabelChange: true,
			}).payload,
		).toMatchObject({
			changes: { name: 'Spray notice' },
			acknowledgedHistoricalLabelChange: true,
		});
	});

	it('creates registrations for subscription or warning purposes with flexible geometry', () => {
		expect(
			createNotificationRegistrationCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				contact: { kind: 'existing', contactId },
				location: { address: { kind: 'none' }, geometry: polygonGeometry },
				bufferDistance: 3,
				bufferUnitId: unitId,
				hasBees: true,
				subscriptions: [],
			}).payload,
		).toMatchObject({
			notificationRegistrationId,
			location: { address: { kind: 'none' }, geometry: polygonGeometry },
			bufferDistance: 3,
			bufferUnitId: unitId,
			hasBees: true,
			isNoSpray: false,
			subscriptions: [],
		});

		expect(
			updateNotificationRegistrationLocationCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				location: { address: { kind: 'existing', addressId }, geometry: lineGeometry },
				acknowledgedFutureOnlyChange: true,
			}).payload.location,
		).toEqual({
			address: { kind: 'existing', addressId },
			geometry: lineGeometry,
		});

		expect(() =>
			createNotificationRegistrationCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				contact: { kind: 'existing', contactId },
				location: { geometry: pointGeometry },
			}),
		).toThrow(DomainValidationError);
	});

	it('validates registration subscriptions, buffers, and flags', () => {
		expect(
			createNotificationRegistrationCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				contact: { kind: 'existing', contactId },
				location: { geometry: pointGeometry },
				subscriptions: [{ notificationRegistrationTypeId, notificationTypeId }],
			}).payload.subscriptions,
		).toEqual([{ notificationRegistrationTypeId, notificationTypeId }]);

		expect(() =>
			createNotificationRegistrationCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				contact: { kind: 'existing', contactId },
				location: { geometry: pointGeometry },
				subscriptions: [
					{ notificationRegistrationTypeId, notificationTypeId },
					{ notificationRegistrationTypeId: notificationRegistrationTypeId2, notificationTypeId },
				],
			}),
		).toThrow(DomainValidationError);

		expect(() =>
			updateNotificationRegistrationBufferCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				bufferDistance: 1,
				bufferUnitId: null,
			}),
		).toThrow(DomainValidationError);

		expect(
			updateNotificationRegistrationFlagsCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				isNoSpray: true,
			}).payload.changes,
		).toEqual({ isNoSpray: true });
	});

	it('builds subscription and mission notification intent commands', () => {
		expect(
			subscribeNotificationRegistrationTypeCommand({
				organizationId,
				actorProfileId,
				notificationRegistrationId,
				notificationRegistrationTypeId,
				notificationTypeId,
			}).payload,
		).toMatchObject({
			notificationRegistrationId,
			notificationRegistrationTypeId,
			notificationTypeId,
		});

		expect(
			generateMissionNotificationsCommand({
				organizationId,
				actorProfileId,
				missionId,
			}),
		).toEqual({
			type: 'publicEngagement.generateMissionNotifications',
			payload: { organizationId, actorProfileId, missionId },
		});

		const statusChangedAt = new Date('2026-05-11T16:00:00.000Z');
		expect(
			reopenMissionNotificationCommand({
				organizationId,
				actorProfileId,
				missionNotificationId,
				statusChangedAt,
			}).payload,
		).toEqual({
			organizationId,
			actorProfileId,
			missionNotificationId,
			statusChangedAt,
		});
	});
});
