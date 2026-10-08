/**
 * `PATCH /commands/organizations/{id}`: the organization's own details.
 *
 * The one table on this surface a client cannot create or delete a row of. An
 * organization is created by a SIMMER operator through `/admin/organizations`,
 * and nothing removes one, so the module declares an update and nothing else: a
 * POST or DELETE here answers 400 naming the intent it does not accept.
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
 *
 * `map_center_lat` and `map_center_lng` are the two numbers among them. The
 * client geocodes the mailing address and sends the top result beside it, and
 * the builder refuses a value outside its range or a centre half cleared.
 */

import type { IdentityCommand, OrganizationDetailChanges } from '@simmer-mosquito/domain';
import { DomainValidationError, updateOrganizationDetailsCommand } from '@simmer-mosquito/domain';
import { type CommandPayload, readNullableText, readNumber } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import {
	type IdentityRow,
	ORGANIZATION_DETAIL_COLUMNS,
	writeIdentityCommand,
} from '../identity-commands.js';
import type { TableCommands } from './dispatch.js';

/**
 * The row version a write is editing against, which is the organization's own
 * record being edited from two consoles at once.
 */
type OrganizationArgument = 'expectedUpdatedAt';

/** The body of a write to this module's table. */
type OrganizationPayload = CommandPayload<'organizations', OrganizationArgument>;

export function organizationTableCommands(
	db: CommandDb,
): TableCommands<'organizations', IdentityCommand, IdentityRow, OrganizationArgument> {
	return {
		table: 'organizations',
		run: {
			db,
			write: writeIdentityCommand,
			notFound: 'organization_not_found',
			key: 'organization',
		},
		intents: {
			'identity.updateOrganizationDetails': ({ payload, organization, id }) => {
				// The path names the organization's own row or it names nothing this
				// session may write. `organizationId` comes from the session either
				// way, so the mismatch is refused rather than silently redirected.
				if (id !== organization.organizationId) {
					throw new DomainValidationError('Update organization details command is invalid.', [
						{ path: 'id', message: 'id must be the signed-in organization.' },
					]);
				}
				return updateOrganizationDetailsCommand({
					...organization,
					...detailChanges(payload),
					expectedUpdatedAt: readNullableText(payload.expectedUpdatedAt),
				});
			},
		},
	};
}

/**
 * The fields a request body asks to change.
 *
 * Walks the same pair table the writer does, in the other direction, which is
 * what `weather.ts` does with its metric columns and for the same reason: nine
 * copies of one `in` test is nine chances to write the wrong one. `in` rather
 * than a truthiness check because clearing a field sends it as `null`, and an
 * absent field must leave the column alone. Absent is `undefined`, because a
 * body is JSON and JSON has no other spelling for it.
 */
function detailChanges(payload: OrganizationPayload): OrganizationDetailChanges {
	const changes: Record<string, string | number | null> = {};
	for (const [column, field] of ORGANIZATION_DETAIL_COLUMNS) {
		if (payload[column] !== undefined) {
			changes[field] = MAP_CENTER_FIELDS.has(field)
				? readNullableCoordinate(payload[column])
				: readNullableText(payload[column]);
		}
	}
	// Every field but `name` is nullable, and `name` arriving blank is what the
	// builder refuses. It reads `null` as absent and answers "name is required"
	// rather than writing an organization with no name.
	return changes as OrganizationDetailChanges;
}

/** The details that are numbers rather than text. */
const MAP_CENTER_FIELDS: ReadonlySet<keyof OrganizationDetailChanges> = new Set([
	'mapCenterLat',
	'mapCenterLng',
]);

/**
 * A coordinate as the builder should judge it.
 *
 * `null` clears and a finite number is a value. Anything else, a string or
 * `NaN` among them, becomes `NaN` rather than absent, so the builder refuses it
 * by name instead of the write leaving the column alone in silence.
 */
function readNullableCoordinate(value: unknown): number | null {
	return value === null ? null : (readNumber(value) ?? Number.NaN);
}
