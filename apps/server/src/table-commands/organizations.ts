/**
 * `PATCH /commands/organizations/{id}` — the agency's own details.
 *
 * The one table on this surface a client cannot create or delete a row of. An
 * agency is created by a SIMMER operator through `/admin/organizations`, and
 * nothing removes one, so the module declares an update and nothing else: a POST
 * or DELETE here answers 400 naming the intent it does not accept.
 *
 * It is also the one table with two write vocabularies until ADR 0013 finishes.
 * The `settings` document is seven `organizationSettings.*` commands on their
 * own routes (`PATCH /organization-settings/{aspect}`) because there is no
 * column diff to read an intent off a JSON document. The columns beside it are
 * this. That split is by shape now rather than by contract, which is what slice
 * 1 bought.
 *
 * ## Field names
 *
 * `expectedUpdatedAt` is camelCase because it names no column: it is the stamp
 * the editor was looking at, and the server refuses with 409 when the row has
 * moved since. Everything else is a column of `organizations`.
 */

import type { OrganizationDetailChanges } from '@simmer-mosquito/domain';
import { DomainValidationError, updateOrganizationDetailsCommand } from '@simmer-mosquito/domain';
import { readNullableText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { type IdentityRow, writeIdentityCommand } from '../identity-commands.js';
import type { TableCommands } from './dispatch.js';
import type { IdentityTableCommand } from './profiles.js';

export function organizationTableCommands(
	db: CommandDb,
): TableCommands<IdentityTableCommand, IdentityRow> {
	return {
		table: 'organizations',
		run: {
			db,
			write: writeIdentityCommand,
			notFound: 'organization_not_found',
			key: 'organization',
		},
		intents: {
			'identity.updateOrganizationDetails': ({ payload, agency, id }) => {
				// The path names the agency's own row or it names nothing this session
				// may write. `organizationId` comes from the session either way, so the
				// mismatch is refused rather than silently redirected.
				if (id !== agency.organizationId) {
					throw new DomainValidationError('Update organization details command is invalid.', [
						{ path: 'id', message: 'id must be the signed-in agency.' },
					]);
				}
				return updateOrganizationDetailsCommand({
					...agency,
					...detailChanges(payload),
					expectedUpdatedAt: readNullableText(payload.expectedUpdatedAt),
				});
			},
		},
	};
}

/**
 * The detail column each field of the command comes from.
 *
 * A pair table rather than nine conditional spreads, which is what
 * `weather.ts` does with its metric columns and for the same reason: nine copies
 * of one `in` test is nine chances to write the wrong one. `in` rather than a
 * truthiness check because clearing a field sends it as `null`, and an absent
 * field must leave the column alone.
 */
const DETAIL_COLUMNS: readonly (readonly [string, string])[] = [
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

function detailChanges(payload: Record<string, unknown>): OrganizationDetailChanges {
	const changes: Record<string, string | null> = {};
	for (const [column, field] of DETAIL_COLUMNS) {
		if (column in payload) {
			changes[field] = readNullableText(payload[column]);
		}
	}
	// Every field but `name` is nullable, and `name` arriving blank is what the
	// builder refuses — it reads `null` as absent and answers "name is required"
	// rather than writing an agency with no name.
	return changes as OrganizationDetailChanges;
}
