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
import {
	agencyCommandContext,
	type CommandContext,
	contactReturnColumns,
	createCommand,
	handleCommandError,
	insertContact,
	invalidUpdate,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	readContactDetails,
	readJsonObject,
	readNullableText,
	readStringArray,
	readText,
	type SafeContact,
	softDelete,
	toSafeContact,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Contacts
// ===========================================================================

export function registerContactRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/public-engagement/contacts', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			createContactCommand({
				...ctx,
				contactId: readText(raw.payload.id) ?? '',
				...readContactDetails(raw.payload),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runContactCommands(context, options.db, [result.command], 201);
	});

	app.post('/public-engagement/contacts/merge', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			mergeContactsCommand({
				...ctx,
				targetContactId: readText(raw.payload.targetContactId) ?? '',
				sourceContactIds: readStringArray(raw.payload.sourceContactIds),
				acknowledgedContactMerge: true,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runContactCommands(context, options.db, [result.command]);
	});

	app.patch(
		'/public-engagement/contacts/:contactId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const contactId = context.req.param('contactId');
			const payload = raw.payload;
			const commands: PublicEngagementCommand[] = [];

			if (['contactName', 'company', 'department', 'title'].some((key) => key in payload)) {
				const result = createCommand(() =>
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
				if (!result.ok) return context.json(result.body, 400);
				commands.push(result.command);
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
				const result = createCommand(() =>
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
				if (!result.ok) return context.json(result.body, 400);
				commands.push(result.command);
			}

			if (commands.length === 0) {
				return context.json(invalidUpdate('contact').body, 400);
			}
			return runContactCommands(context, options.db, commands);
		},
	);

	app.delete(
		'/public-engagement/contacts/:contactId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteContactCommand({ ...ctx, contactId: context.req.param('contactId') }),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runContactCommands(context, options.db, [result.command]);
		},
	);
}

async function runContactCommands(
	context: CommandContext,
	db: PublicEngagementDb,
	commands: readonly PublicEngagementCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeContactCommand);
		if (result.row === null) {
			return context.json({ error: 'contact_not_found' }, 404);
		}
		return context.json({ contact: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeContactCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<SafeContact | null> {
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
			for (const sourceId of command.payload.sourceContactIds) {
				await softDelete(
					trx,
					'contacts',
					sourceId,
					command.payload.organizationId,
					command.payload.actorProfileId,
					contactReturnColumns,
					toSafeContact,
				);
			}
			return loadContact(trx, command.payload.targetContactId, command.payload.organizationId);
		}
		case 'publicEngagement.deleteContact':
			return softDelete(
				trx,
				'contacts',
				command.payload.contactId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				contactReturnColumns,
				toSafeContact,
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
): Promise<SafeContact | null> {
	return updateRow(
		trx,
		'contacts',
		contactId,
		organizationId,
		set,
		contactReturnColumns,
		toSafeContact,
	);
}

async function loadContact(
	trx: PublicEngagementTransaction,
	contactId: string,
	organizationId: string,
): Promise<SafeContact | null> {
	const row = await trx
		.selectFrom('contacts')
		.select(contactReturnColumns)
		.where('id', '=', contactId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined ? null : toSafeContact(row);
}
