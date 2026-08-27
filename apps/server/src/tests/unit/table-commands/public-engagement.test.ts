/**
 * The six public-engagement maps.
 *
 * The reading worth pinning hardest is the mission notification's, which was a
 * `switch (payload.status)` with a `default:` arm that reopened. A misspelled
 * status, or none at all, silently reopened a notification somebody had already
 * dealt with — four outcomes and a catch-all, where the branch's other
 * value-read-for-direction bugs at least only had two.
 */

import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import {
	contactTableCommands,
	serviceRequestTableCommands,
} from '../../../table-commands/contacts.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import {
	missionNotificationTableCommands,
	notificationRegistrationTableCommands,
	notificationRegistrationTypeTableCommands,
	notificationTypeTableCommands,
} from '../../../table-commands/notifications.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const CONTACT = '44444444-4444-4444-8444-444444444444';
const ADDRESS = '55555555-5555-4555-8555-555555555555';
const OTHER_CONTACT = '66666666-6666-4666-8666-666666666666';
const REGISTRATION = '77777777-7777-4777-8777-777777777777';
const TYPE = '88888888-8888-4888-8888-888888888888';
const UNIT = '99999999-9999-4999-8999-999999999999';

const POINT = { type: 'Point', coordinates: [-81, 28] };
const CONTACT_REF = { kind: 'existing', contactId: CONTACT };
const LOCATION = { address: { kind: 'existing', addressId: ADDRESS }, geometry: POINT };

const contacts = contactTableCommands(undefined as never);
const serviceRequests = serviceRequestTableCommands(undefined as never);
const notificationTypes = notificationTypeTableCommands(undefined as never);
const registrations = notificationRegistrationTableCommands(undefined as never);
const registrationTypes = notificationRegistrationTypeTableCommands(undefined as never);
const missionNotifications = missionNotificationTableCommands(undefined as never);

function request(payload: Record<string, unknown>): IntentRequest {
	return {
		payload,
		agency: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
		} as unknown as AuthContext,
		id: ROW,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<TCommand, unknown>,
	intent: AgencyCommandType,
	intentRequest: IntentRequest,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

describe('contacts intent map', () => {
	it('reads a contact off column names', () => {
		const command = build(
			contacts,
			'publicEngagement.createContact',
			request({
				contact_name: 'R. Alvarez',
				preferred_phone: '555-0100',
				wants_sms: true,
			}),
		);

		expect(command.payload).toMatchObject({
			contactId: ROW,
			contactName: 'R. Alvarez',
			preferredPhone: '555-0100',
			wantsSms: true,
			// Absent is false, not unknown.
			wantsEmail: false,
			wantsPhone: false,
		});
	});

	it('splits who they are from how to reach them', () => {
		// Two commands because the second carries consent — a number and its
		// `wants_*` move together, and a job title is not that kind of edit.
		const details = build(
			contacts,
			'publicEngagement.updateContactDetails',
			request({ title: 'Facilities manager' }),
		);
		const communication = build(
			contacts,
			'publicEngagement.updateContactCommunication',
			request({ email: null, wants_email: false }),
		);

		expect(details.payload).toMatchObject({ changes: { title: 'Facilities manager' } });
		expect((details.payload as { changes: object }).changes).not.toHaveProperty('email');
		expect(communication.payload).toMatchObject({ changes: { email: null, wantsEmail: false } });
	});

	it('merges into the row the write names, from sources in the body', () => {
		// There is no column for "contacts being folded into this one".
		const command = build(
			contacts,
			'publicEngagement.mergeContacts',
			request({ sourceContactIds: [CONTACT, OTHER_CONTACT] }),
		);

		expect(command.payload).toMatchObject({
			targetContactId: ROW,
			sourceContactIds: [CONTACT, OTHER_CONTACT],
		});
	});
});

describe('service_requests intent map', () => {
	it('takes a contact and a location as references, not as ids', () => {
		// `contact_id` and `address_id` are columns and neither is the argument:
		// taking a request often means taking a caller who has never called before.
		const command = build(
			serviceRequests,
			'publicEngagement.createServiceRequest',
			request({
				contact: CONTACT_REF,
				location: LOCATION,
				intake_type: 'phone',
				request_date: '2026-08-10',
				details: 'Standing water in the alley',
			}),
		);

		expect(command.payload).toMatchObject({
			serviceRequestId: ROW,
			contact: { kind: 'existing', contactId: CONTACT },
			intakeType: 'phone',
			requestDate: '2026-08-10',
			details: 'Standing water in the alley',
		});
	});

	it('closes with a resolution comment and a column-named timestamp', () => {
		const closedAt = '2026-08-12T15:00:00.000Z';
		const command = build(
			serviceRequests,
			'publicEngagement.closeServiceRequest',
			request({
				resolutionCommentId: CONTACT,
				resolutionSummary: 'Treated and drained',
				closed_at: closedAt,
			}),
		);

		expect(command.payload).toMatchObject({
			resolutionCommentId: CONTACT,
			resolutionSummary: 'Treated and drained',
			closedAt: new Date(closedAt),
		});
	});
});

describe('notification catalog and registrations', () => {
	it('carries the subscription-impact acknowledgement on deactivate only', () => {
		const off = build(
			notificationTypes,
			'publicEngagement.deactivateNotificationType',
			request({ acknowledgedActiveSubscriptionImpact: false }),
		);
		const on = build(notificationTypes, 'publicEngagement.reactivateNotificationType', request({}));

		expect(off.payload).toMatchObject({ acknowledgedActiveSubscriptionImpact: false });
		expect(on.payload).not.toHaveProperty('acknowledgedActiveSubscriptionImpact');
	});

	it('takes a buffer as both halves at once', () => {
		// A distance with no unit is not a buffer, and clearing one clears both, so
		// this reads values rather than presence.
		const set = build(
			registrations,
			'publicEngagement.updateNotificationRegistrationBuffer',
			request({ buffer_distance: 500, buffer_unit_id: UNIT }),
		);
		const cleared = build(
			registrations,
			'publicEngagement.updateNotificationRegistrationBuffer',
			request({}),
		);

		expect(set.payload).toMatchObject({ bufferDistance: 500, bufferUnitId: UNIT });
		expect(cleared.payload).toMatchObject({ bufferDistance: null, bufferUnitId: null });
	});

	it('subscribes through the link row columns', () => {
		const command = build(
			registrationTypes,
			'publicEngagement.subscribeNotificationRegistrationType',
			request({ notification_registration_id: REGISTRATION, notification_type_id: TYPE }),
		);

		expect(command.payload).toMatchObject({
			notificationRegistrationTypeId: ROW,
			notificationRegistrationId: REGISTRATION,
			notificationTypeId: TYPE,
		});
	});
});

describe('mission_notifications intent map', () => {
	it('does not read the status column to decide the outcome', () => {
		// The old route switched on `payload.status` with `default:` reopening, so a
		// body whose status was missing or misspelled reopened a notification that
		// had already been dealt with. Each of the four is named now, and a body
		// still carrying the old value cannot reverse the command it was sent with.
		const completed = build(
			missionNotifications,
			'publicEngagement.completeMissionNotification',
			request({ status: 'pending' }),
		);
		const reopened = build(
			missionNotifications,
			'publicEngagement.reopenMissionNotification',
			request({ status: 'completed' }),
		);
		const nonsense = build(
			missionNotifications,
			'publicEngagement.skipMissionNotification',
			request({ status: 'not-a-status' }),
		);

		expect([completed.type, reopened.type, nonsense.type]).toEqual([
			'publicEngagement.completeMissionNotification',
			'publicEngagement.reopenMissionNotification',
			'publicEngagement.skipMissionNotification',
		]);
	});

	it('reads when the status moved off its own column', () => {
		const at = '2026-08-12T15:00:00.000Z';
		const command = build(
			missionNotifications,
			'publicEngagement.failMissionNotification',
			request({ status_changed_at: at }),
		);

		expect(command.payload).toMatchObject({ statusChangedAt: new Date(at) });
	});
});
