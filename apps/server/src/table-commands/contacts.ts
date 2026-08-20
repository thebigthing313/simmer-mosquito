/**
 * The `contacts` and `service_requests` tables, as commands.
 *
 * Twelve commands. A contact is a member of the public; a service request is
 * what they called about.
 *
 * ## `contact` and `location` are instructions, not columns
 *
 * `service_requests` carries `contact_id` and `address_id`, and neither is what
 * a caller sends. Both commands take a *reference* — the domain's
 * `ContactReferenceInput` is either "this existing contact" or "a new one, with
 * these details", and `ServiceRequestLocationInput` says the same about an
 * address and its geometry. Taking a request means often taking a contact who
 * has never called before, and the two are one transaction.
 *
 * So a column that holds the *result* of a reference does not get to name the
 * argument, which is the same reading `context` gets in `performed-actions.ts`.
 *
 * ## Closing and reopening write a comment
 *
 * `closeServiceRequest` takes a `resolutionCommentId` and a `resolutionSummary`;
 * reopening takes the same pair under its own names. Those are not columns on
 * this table at all — the resolution is a comment, and closing the request
 * without recording why it closed is not a thing the domain offers. `closedAt`
 * *is* a column, so it is the one snake_case key of the four.
 *
 * ## Field names
 *
 * Postgres column names: `contact_name`, `preferred_phone`, `alternate_phone`,
 * `email`, `company`, `department`, `title`, `wants_email`, `wants_sms`,
 * `wants_phone`, `intake_type`, `request_date`, `details`,
 * `received_by_profile_id`, `closed_at`.
 */

import {
	type ContactReferenceInput,
	closeServiceRequestCommand,
	createContactCommand,
	createServiceRequestCommand,
	deleteContactCommand,
	deleteServiceRequestCommand,
	mergeContactsCommand,
	type PublicEngagementCommand,
	reopenServiceRequestCommand,
	type ServiceRequestLocationInput,
	updateContactCommunicationCommand,
	updateContactDetailsCommand,
	updateServiceRequestContactCommand,
	updateServiceRequestDetailsCommand,
	updateServiceRequestLocationCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import { type CommandDb, readDate } from '../command-write.js';
import { writeContactCommand } from '../public-engagement-records-commands/contacts.js';
import { writeServiceRequestCommand } from '../public-engagement-records-commands/service-requests.js';
import type {
	SafeContact,
	SafeServiceRequest,
} from '../public-engagement-records-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged, readIdList } from './shared.js';

/** A boolean column, where absent is false rather than unknown. */
function flag(value: unknown): boolean {
	return value === true;
}

export function contactTableCommands(
	db: CommandDb,
): TableCommands<PublicEngagementCommand, SafeContact> {
	return {
		table: 'contacts',
		run: { db, write: writeContactCommand, notFound: 'contact_not_found', key: 'contact' },
		intents: {
			'publicEngagement.createContact': ({ payload, agency, id }) =>
				createContactCommand({
					...agency,
					contactId: id,
					contactName: readNullableText(payload.contact_name),
					preferredPhone: readNullableText(payload.preferred_phone),
					alternatePhone: readNullableText(payload.alternate_phone),
					email: readNullableText(payload.email),
					company: readNullableText(payload.company),
					department: readNullableText(payload.department),
					title: readNullableText(payload.title),
					wantsEmail: flag(payload.wants_email),
					wantsSms: flag(payload.wants_sms),
					wantsPhone: flag(payload.wants_phone),
				}),

			// Who they are and how to reach them are two commands, because the second
			// carries consent — a phone number and a `wants_phone` move together, and
			// changing a job title is not the same kind of edit.
			'publicEngagement.updateContactDetails': ({ payload, agency, id }) =>
				updateContactDetailsCommand({
					...agency,
					contactId: id,
					...('contact_name' in payload
						? { contactName: readNullableText(payload.contact_name) }
						: {}),
					...('company' in payload ? { company: readNullableText(payload.company) } : {}),
					...('department' in payload ? { department: readNullableText(payload.department) } : {}),
					...('title' in payload ? { title: readNullableText(payload.title) } : {}),
				}),

			'publicEngagement.updateContactCommunication': ({ payload, agency, id }) =>
				updateContactCommunicationCommand({
					...agency,
					contactId: id,
					...('preferred_phone' in payload
						? { preferredPhone: readNullableText(payload.preferred_phone) }
						: {}),
					...('alternate_phone' in payload
						? { alternatePhone: readNullableText(payload.alternate_phone) }
						: {}),
					...('email' in payload ? { email: readNullableText(payload.email) } : {}),
					...('wants_email' in payload ? { wantsEmail: flag(payload.wants_email) } : {}),
					...('wants_sms' in payload ? { wantsSms: flag(payload.wants_sms) } : {}),
					...('wants_phone' in payload ? { wantsPhone: flag(payload.wants_phone) } : {}),
				}),

			// The row this write names is the *target* — the contact that survives —
			// and the sources come from the body, because there is no column for
			// "contacts being folded into this one".
			'publicEngagement.mergeContacts': ({ payload, agency, id }) =>
				mergeContactsCommand({
					...agency,
					targetContactId: id,
					sourceContactIds: readIdList(payload.sourceContactIds),
					acknowledgedContactMerge: acknowledged(payload.acknowledgedContactMerge),
				}),

			'publicEngagement.deleteContact': ({ agency, id }) =>
				deleteContactCommand({ ...agency, contactId: id }),
		},
	};
}

export function serviceRequestTableCommands(
	db: CommandDb,
): TableCommands<PublicEngagementCommand, SafeServiceRequest> {
	return {
		table: 'service_requests',
		run: {
			db,
			write: writeServiceRequestCommand,
			notFound: 'service_request_not_found',
			key: 'serviceRequest',
		},
		intents: {
			'publicEngagement.createServiceRequest': ({ payload, agency, id }) =>
				createServiceRequestCommand({
					...agency,
					serviceRequestId: id,
					// Both untyped for the reason `locationSource` is: which shapes a
					// reference may take is the domain builder's rule.
					contact: payload.contact as ContactReferenceInput,
					location: payload.location as ServiceRequestLocationInput,
					intakeType: (readText(payload.intake_type) ?? '') as never,
					requestDate: readText(payload.request_date) ?? '',
					details: readText(payload.details) ?? '',
					receivedByProfileId: readNullableText(payload.received_by_profile_id),
				}),

			'publicEngagement.updateServiceRequestDetails': ({ payload, agency, id }) =>
				updateServiceRequestDetailsCommand({
					...agency,
					serviceRequestId: id,
					...('request_date' in payload
						? { requestDate: readText(payload.request_date) ?? '' }
						: {}),
					...('intake_type' in payload
						? { intakeType: (readText(payload.intake_type) ?? '') as never }
						: {}),
					...('received_by_profile_id' in payload
						? { receivedByProfileId: readNullableText(payload.received_by_profile_id) }
						: {}),
					...('details' in payload ? { details: readText(payload.details) ?? '' } : {}),
					acknowledgedClosedRequestChange: acknowledged(payload.acknowledgedClosedRequestChange),
				}),

			'publicEngagement.updateServiceRequestContact': ({ payload, agency, id }) =>
				updateServiceRequestContactCommand({
					...agency,
					serviceRequestId: id,
					contact: payload.contact as ContactReferenceInput,
					acknowledgedHistoricalContactChange: acknowledged(
						payload.acknowledgedHistoricalContactChange,
					),
				}),

			'publicEngagement.updateServiceRequestLocation': ({ payload, agency, id }) =>
				updateServiceRequestLocationCommand({
					...agency,
					serviceRequestId: id,
					location: payload.location as ServiceRequestLocationInput,
					acknowledgedHistoricalLocationChange: acknowledged(
						payload.acknowledgedHistoricalLocationChange,
					),
				}),

			// A resolution is a comment, and closing without recording why is not
			// offered. `closed_at` is the one column of the three.
			'publicEngagement.closeServiceRequest': ({ payload, agency, id }) =>
				closeServiceRequestCommand({
					...agency,
					serviceRequestId: id,
					resolutionCommentId: readText(payload.resolutionCommentId) ?? '',
					resolutionSummary: readText(payload.resolutionSummary) ?? '',
					closedAt: readDate(payload.closed_at),
				}),

			'publicEngagement.reopenServiceRequest': ({ payload, agency, id }) =>
				reopenServiceRequestCommand({
					...agency,
					serviceRequestId: id,
					reopenCommentId: readText(payload.reopenCommentId) ?? '',
					reopenReason: readText(payload.reopenReason) ?? '',
					reopenedAt: readDate(payload.reopenedAt),
				}),

			'publicEngagement.deleteServiceRequest': ({ payload, agency, id }) =>
				deleteServiceRequestCommand({
					...agency,
					serviceRequestId: id,
					acknowledgedClosedRequestDeletion: acknowledged(
						payload.acknowledgedClosedRequestDeletion,
					),
					acknowledgedAssignmentItemDeletion: acknowledged(
						payload.acknowledgedAssignmentItemDeletion,
					),
				}),
		},
	};
}
