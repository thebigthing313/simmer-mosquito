/**
 * The identity writes that are commands.
 *
 * Three of the seven ADR 0013 names: the organization's own details, and
 * creating and editing a Profile. All three write Postgres and nothing else, so
 * they need no part of the spanning contract. The writer takes the transaction
 * the command runner opened, like every other domain's.
 *
 * The four that are still REST live in `organization-commands.ts` and
 * `profile-commands.ts` with their floors in `IDENTITY_FLOORS`. They stay there
 * until slice 3, which is where the WorkOS half is settled (#186).
 */

import { type SelectedRow, sql, updateRow } from '@simmer-mosquito/db';
import type { IdentityCommand, OrganizationDetailChanges } from '@simmer-mosquito/domain';
import { CommandError } from './command-endpoint.js';
import type { ColumnOf } from './command-payload.js';
import type { CommandTransaction } from './command-write.js';

const organizationReturnColumns = [
	'id',
	'name',
	'slug',
	'main_contact_email',
	'phone_number',
	'mailing_country',
	'mailing_address_line_1',
	'mailing_address_line_2',
	'mailing_locality',
	'mailing_region',
	'mailing_postal_code',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

const profileReturnColumns = [
	'id',
	'organization_id',
	'user_id',
	'display_name',
	'email',
	'is_active',
	'created_at',
	'updated_at',
] as const;

export type OrganizationRow = SelectedRow<'organizations', typeof organizationReturnColumns>;
export type ProfileRow = SelectedRow<'profiles', typeof profileReturnColumns>;

export type IdentityRow = OrganizationRow | ProfileRow;

export async function writeIdentityCommand(
	trx: CommandTransaction,
	command: IdentityCommand,
): Promise<IdentityRow | null> {
	switch (command.type) {
		case 'identity.updateOrganizationDetails':
			return updateOrganizationDetails(trx, command.payload);
		case 'identity.createProfile': {
			const row = await trx
				.insertInto('profiles')
				.values({
					id: command.payload.profileId,
					organization_id: command.payload.organizationId,
					// No login behind it, which is what makes the Profile historical. An
					// invitation is what attaches one, and that is a different floor and
					// a command that spans WorkOS.
					user_id: null,
					display_name: command.payload.displayName,
					email: null,
					is_active: command.payload.isActive,
				})
				.returning(profileReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'identity.updateProfile':
			return updateRow(
				trx,
				'profiles',
				command.payload.profileId,
				command.payload.organizationId,
				{
					...(command.payload.changes.displayName === undefined
						? {}
						: { display_name: command.payload.changes.displayName }),
					...(command.payload.changes.isActive === undefined
						? {}
						: { is_active: command.payload.changes.isActive }),
				},
				profileReturnColumns,
			);
		default:
			throw new Error(`Unsupported identity command: ${(command as IdentityCommand).type}`);
	}
}

/**
 * The organization's own row, which is not org-owned in the sense `updateRow`
 * means: its tenant column *is* its `id`, so the scope predicate is written out
 * here.
 *
 * The conflict check is the one thing this write has that the other two do not.
 * `expectedUpdatedAt` is what the editor was looking at, and a row that has
 * moved since answers 409 rather than overwriting somebody. It belongs on the
 * server because it compares against stored state; the builder only checks that
 * what arrived is a timestamp.
 */
async function updateOrganizationDetails(
	trx: CommandTransaction,
	payload: Extract<IdentityCommand, { type: 'identity.updateOrganizationDetails' }>['payload'],
): Promise<OrganizationRow | null> {
	const current = await trx
		.selectFrom('organizations')
		.select(['id', 'updated_at'])
		.where('id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	if (current === undefined) {
		return null;
	}

	if (
		payload.expectedUpdatedAt !== null &&
		current.updated_at.getTime() !== new Date(payload.expectedUpdatedAt).getTime()
	) {
		throw new CommandError(409, {
			error: 'organization_conflict',
			reason: 'Somebody else changed this organization while you were editing.',
		});
	}

	const row = await trx
		.updateTable('organizations')
		.set({
			...detailColumns(payload.changes),
			updated_by_profile_id: payload.actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.returning(organizationReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

/**
 * Each organization detail as the column it is and the command field it
 * becomes.
 *
 * One list, read in both directions: `table-commands/organizations.ts` walks it
 * to turn a request body into command input, and `detailColumns` below walks it
 * to turn the command back into a `set`. Two lists would be the same nine facts
 * written twice, inverted, and a mailing column added to one of them silently
 * stops arriving through the other.
 *
 * A table rather than nine conditional spreads, because the command's `changes`
 * carries a field only when the client sent it: a field's absence and a field
 * set to `null` are different writes, and `in` is what tells them apart. Written
 * out nine times, that distinction is nine chances to write `??` instead.
 */
export const ORGANIZATION_DETAIL_COLUMNS: readonly (readonly [
	column: ColumnOf<'organizations'>,
	field: keyof OrganizationDetailChanges,
])[] = [
	['name', 'name'],
	['main_contact_email', 'mainContactEmail'],
	['phone_number', 'phoneNumber'],
	['mailing_country', 'mailingCountry'],
	['mailing_address_line_1', 'mailingAddressLine1'],
	['mailing_address_line_2', 'mailingAddressLine2'],
	['mailing_locality', 'mailingLocality'],
	['mailing_region', 'mailingRegion'],
	['mailing_postal_code', 'mailingPostalCode'],
];

function detailColumns(changes: OrganizationDetailChanges): Record<string, unknown> {
	const set: Record<string, unknown> = {};
	for (const [column, field] of ORGANIZATION_DETAIL_COLUMNS) {
		if (field in changes) {
			set[column] = changes[field];
		}
	}
	return set;
}
