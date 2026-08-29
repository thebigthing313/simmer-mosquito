import { applyRecordDeletion, applyRecordMerge } from '@simmer-mosquito/db';
import {
	createContactCommand,
	deleteContactCommand,
	mergeContactsCommand,
	type PublicEngagementCommand,
	updateContactCommunicationCommand,
	updateContactDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import {
	type CommandContext,
	type ContactRow,
	commandEndpoint,
	contactReturnColumns,
	insertContact,
	invalidUpdate,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	readContactDetails,
	runCommands,
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

export function registerContactRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/public-engagement/contacts',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createContactCommand({
					...ctx,
					contactId: readText(payload.id) ?? '',
					...readContactDetails(payload),
				}),
			run: (context, commands) => runContactCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/public-engagement/contacts/:contactId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) => {
				const contactId = param('contactId');
				const commands: PublicEngagementCommand[] = [];

				if (['contactName', 'company', 'department', 'title'].some((key) => key in payload)) {
					commands.push(
						updateContactDetailsCommand({
							...ctx,
							contactId,
							...('contactName' in payload
								? { contactName: readNullableText(payload.contactName) }
								: {}),
							...('company' in payload ? { company: readNullableText(payload.company) } : {}),
							...('department' in payload
								? { department: readNullableText(payload.department) }
								: {}),
							...('title' in payload ? { title: readNullableText(payload.title) } : {}),
						}),
					);
				}

				const communicationKeys = [
					'preferredPhone',
					'alternatePhone',
					'email',
					'wantsEmail',
					'wantsSms',
					'wantsPhone',
				];
				if (communicationKeys.some((key) => key in payload)) {
					commands.push(
						updateContactCommunicationCommand({
							...ctx,
							contactId,
							...('preferredPhone' in payload
								? { preferredPhone: readNullableText(payload.preferredPhone) }
								: {}),
							...('alternatePhone' in payload
								? { alternatePhone: readNullableText(payload.alternatePhone) }
								: {}),
							...('email' in payload ? { email: readNullableText(payload.email) } : {}),
							...('wantsEmail' in payload ? { wantsEmail: payload.wantsEmail === true } : {}),
							...('wantsSms' in payload ? { wantsSms: payload.wantsSms === true } : {}),
							...('wantsPhone' in payload ? { wantsPhone: payload.wantsPhone === true } : {}),
						}),
					);
				}

				return commands.length === 0 ? invalidUpdate('contact') : { ok: true, commands };
			},
			run: (context, commands) => runContactCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/public-engagement/contacts/:contactId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteContactCommand({ ...ctx, contactId: param('contactId') }),
			run: (context, commands) => runContactCommands(context, options.db, commands),
		}),
	);
}

async function runContactCommands(
	context: CommandContext,
	db: PublicEngagementDb,
	commands: readonly PublicEngagementCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeContactCommand, notFound: 'contact_not_found', key: 'contact' },
		commands,
		createdStatus,
	);
}

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
					contactReturnColumns,
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
				contactReturnColumns,
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
	return updateRow(trx, 'contacts', contactId, organizationId, set, contactReturnColumns);
}

async function loadContact(
	trx: PublicEngagementTransaction,
	contactId: string,
	organizationId: string,
): Promise<ContactRow | null> {
	const row = await trx
		.selectFrom('contacts')
		.select(contactReturnColumns)
		.where('id', '=', contactId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}
