/**
 * The `requested_control_actions` table, as commands.
 *
 * What somebody asked for, as opposed to what a technician did. Six commands.
 *
 * ## Resolution was the worst boolean on the branch
 *
 * The old PATCH decided between resolving a request and reopening it with
 * `payload.isResolved !== false && payload.resolvedAt !== null`, guarded by
 * `'resolvedAt' in payload || typeof payload.isResolved === 'boolean'`. Two keys,
 * one of them optional, combined into one direction — so a client clearing a
 * resolution date reopened the request, and a client sending `isResolved: true`
 * with no date resolved it at the server's clock. Neither is wrong exactly;
 * neither is legible either. `resolveRequestedControlAction` and
 * `reopenRequestedControlAction` are named here and read only what they take.
 *
 * ## `context` again, and why the columns do not settle it
 *
 * Unlike the performed actions, this table *does* have all three context
 * columns — `habitat_id`, `inspection_id`, `collection_id`. They still do not
 * answer the question the domain asks, because what it takes is a tagged union
 * and the tag is not a column: a larval context with no ids and no context at
 * all write the same three nulls and mean different things. So `context` travels
 * as the instruction it is, and the columns are its result.
 *
 * There is a scar here worth not reopening. The old builder originally read only
 * the nested `context` object, and because `hasLocationContextChange` gates the
 * command, an edit that moved a request to a different habitat and changed
 * nothing else produced *no command* and came back as "invalid update". That
 * cannot happen on this surface: the request names
 * `updateRequestedControlActionLocationAndContext`, so a body with nothing for
 * it to change is refused by the domain, which says which field it wanted.
 *
 * ## Field names
 *
 * Postgres column names: `control_type`, `recommended_method_id`, `summary`,
 * `requested_by_profile_id`, `requested_at`, `resolved_at`, `address_id`.
 * `context` and `locationSource` are instructions.
 */

import {
	type ControlActionContext,
	type ControlOperationsCommand,
	deleteRequestedControlActionCommand,
	type RequestedControlActionLocationSourceInput,
	reopenRequestedControlActionCommand,
	requestControlActionCommand,
	resolveRequestedControlActionCommand,
	updateRequestedControlActionDetailsCommand,
	updateRequestedControlActionLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import { type CommandDb, readDate } from '../command-write.js';
import { writeRequestedControlActionCommand } from '../control-operations-commands/requested-control-actions.js';
import type { SafeRequestedControlAction } from '../control-operations-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

function requestContext(payload: Record<string, unknown>): ControlActionContext {
	return (payload.context ?? { kind: 'none' }) as ControlActionContext;
}

export function requestedControlActionTableCommands(
	db: CommandDb,
): TableCommands<ControlOperationsCommand, SafeRequestedControlAction> {
	return {
		table: 'requested_control_actions',
		run: {
			db,
			write: writeRequestedControlActionCommand,
			notFound: 'requested_control_action_not_found',
			key: 'requestedControlAction',
		},
		intents: {
			'controlOperations.requestControlAction': ({ payload, agency, id }) =>
				requestControlActionCommand({
					...agency,
					requestedControlActionId: id,
					// Untyped: which four control types exist is the domain's list, and a
					// second copy here could fall behind it.
					controlType: (readText(payload.control_type) ?? '') as never,
					locationSource: payload.locationSource as RequestedControlActionLocationSourceInput,
					addressId: readNullableText(payload.address_id),
					context: requestContext(payload),
					recommendedMethodId: readNullableText(payload.recommended_method_id),
					summary: readNullableText(payload.summary),
					requestedByProfileId: readNullableText(payload.requested_by_profile_id),
					requestedAt: readDate(payload.requested_at),
				}),

			'controlOperations.updateRequestedControlActionDetails': ({ payload, agency, id }) =>
				updateRequestedControlActionDetailsCommand({
					...agency,
					requestedControlActionId: id,
					...('control_type' in payload
						? { controlType: (readText(payload.control_type) ?? '') as never }
						: {}),
					...('recommended_method_id' in payload
						? { recommendedMethodId: readNullableText(payload.recommended_method_id) }
						: {}),
					...('summary' in payload ? { summary: readNullableText(payload.summary) } : {}),
					...('requested_by_profile_id' in payload
						? { requestedByProfileId: readNullableText(payload.requested_by_profile_id) }
						: {}),
					...('requested_at' in payload ? { requestedAt: readDate(payload.requested_at) } : {}),
				}),

			'controlOperations.updateRequestedControlActionLocationAndContext': ({
				payload,
				agency,
				id,
			}) =>
				updateRequestedControlActionLocationAndContextCommand({
					...agency,
					requestedControlActionId: id,
					...('locationSource' in payload
						? {
								locationSource: payload.locationSource as RequestedControlActionLocationSourceInput,
							}
						: {}),
					...('address_id' in payload ? { addressId: readNullableText(payload.address_id) } : {}),
					...('context' in payload ? { context: requestContext(payload) } : {}),
				}),

			// `resolved_at` is read where the command says a resolution is what this
			// is; an absent one means "now", which is what a technician closing a
			// request in the field means by it.
			'controlOperations.resolveRequestedControlAction': ({ payload, agency, id }) =>
				resolveRequestedControlActionCommand({
					...agency,
					requestedControlActionId: id,
					resolvedAt: readDate(payload.resolved_at),
				}),

			'controlOperations.reopenRequestedControlAction': ({ agency, id }) =>
				reopenRequestedControlActionCommand({ ...agency, requestedControlActionId: id }),

			'controlOperations.deleteRequestedControlAction': ({ payload, agency, id }) =>
				deleteRequestedControlActionCommand({
					...agency,
					requestedControlActionId: id,
					acknowledgedActionDetach: acknowledged(payload.acknowledgedActionDetach),
					acknowledgedMissionDetach: acknowledged(payload.acknowledgedMissionDetach),
				}),
		},
	};
}
