import { applyRecordDeletion, applyRecordMerge } from '@simmer-mosquito/db';
import type { PublicEngagementCommand } from '@simmer-mosquito/domain';
import { returnColumns } from '../../return-columns.js';
import {
	type ContactRow,
	insertContact,
	type PublicEngagementTransaction,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Contacts
// ===========================================================================

/*
 * `POST /public-engagement/contacts/merge` used to be here and is gone.
 *
 * It hard-coded `acknowledgedContactMerge: true`, so the one guard on an
 * irreversible command could not be withheld by any caller. Nothing called it:
 * `PATCH /commands/contacts/{target}` with the `publicEngagement.mergeContacts`
 * intent is the route, and it reads the acknowledgement from the body like every
 * other one. A second door to a destructive command with the lock removed is
 * worth deleting rather than leaving for somebody to find.
 */

export async function writeContactCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<ContactRow | null> {
	switch (command.type) {
		case 'publicEngagement.createContact': {
			const row = await insertContact(
				trx,
				command.payload.organizationId,
				command.payload.contactId,
				command.payload,
				command.payload.actorProfileId,
			);
			return row;
		}
		case 'publicEngagement.updateContactDetails':
			return updateContact(trx, command.payload.contactId, command.payload.organizationId, {
				...('contactName' in command.payload.changes
					? { contact_name: command.payload.changes.contactName ?? null }
					: {}),
				...('company' in command.payload.changes
					? { company: command.payload.changes.company ?? null }
					: {}),
				...('department' in command.payload.changes
					? { department: command.payload.changes.department ?? null }
					: {}),
				...('title' in command.payload.changes
					? { title: command.payload.changes.title ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'publicEngagement.updateContactCommunication':
			return updateContact(trx, command.payload.contactId, command.payload.organizationId, {
				...('preferredPhone' in command.payload.changes
					? { preferred_phone: command.payload.changes.preferredPhone ?? null }
					: {}),
				...('alternatePhone' in command.payload.changes
					? { alternate_phone: command.payload.changes.alternatePhone ?? null }
					: {}),
				...('email' in command.payload.changes
					? { email: command.payload.changes.email ?? null }
					: {}),
				...('wantsEmail' in command.payload.changes
					? { wants_email: command.payload.changes.wantsEmail ?? false }
					: {}),
				...('wantsSms' in command.payload.changes
					? { wants_sms: command.payload.changes.wantsSms ?? false }
					: {}),
				...('wantsPhone' in command.payload.changes
					? { wants_phone: command.payload.changes.wantsPhone ?? false }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'publicEngagement.mergeContacts': {
			// This used to be the soft deletes alone. That retired the source contacts
			// and left every service request and notification registration pointing at
			// a row that no longer resolves anywhere. No error, no constraint, the
			// contact simply gone from every surface that filters `deleted_at`.
			//
			// `applyRecordMerge` is the re-pointing, and it runs first: each rule finds
			// its rows by the source contact id, and a source already deleted is not
			// one of them. `mission_notifications` is deliberately not among the
			// rules, because those rows snapshot who was told and how.
			await applyRecordMerge(trx, {
				recordType: 'contact',
				targetId: command.payload.targetContactId,
				sourceIds: command.payload.sourceContactIds,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			for (const sourceId of command.payload.sourceContactIds) {
				await softDelete(
					trx,
					'contacts',
					sourceId,
					command.payload.organizationId,
					command.payload.actorProfileId,
					returnColumns.contacts,
				);
			}
			return loadContact(trx, command.payload.targetContactId, command.payload.organizationId);
		}
		case 'publicEngagement.deleteContact':
			await applyRecordDeletion(trx, {
				recordType: 'contact',
				recordId: command.payload.contactId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				// Nothing to confirm: a contact with any service request, registration,
				// or sent notification is blocked outright, and what remains is the
				// contact's own comments and tags.
				acknowledged: {},
			});
			return softDelete(
				trx,
				'contacts',
				command.payload.contactId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.contacts,
			);
		default:
			throw new Error(`Unsupported contact command: ${command.type}`);
	}
}

async function updateContact(
	trx: PublicEngagementTransaction,
	contactId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<ContactRow | null> {
	return updateRow(trx, 'contacts', contactId, organizationId, set, returnColumns.contacts);
}

async function loadContact(
	trx: PublicEngagementTransaction,
	contactId: string,
	organizationId: string,
): Promise<ContactRow | null> {
	const row = await trx
		.selectFrom('contacts')
		.select(returnColumns.contacts)
		.where('id', '=', contactId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}
