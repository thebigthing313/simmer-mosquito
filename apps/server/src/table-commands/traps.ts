/**
 * The `traps` table, as commands.
 *
 * Six commands, and the PATCH that reached them was the branch's other
 * `isActive` boolean read for its direction: `true` reactivated the trap and
 * `false` retired it. Two names now, the same way `markHabitatInaccessible` and
 * `markSampleZeroLarvae` are named.
 *
 * ## Field names
 *
 * Postgres column names: `collection_method_id`, `collection_lure_id`,
 * `address_id`, `trap_name`, `trap_code`, `description`. `locationSource` stays
 * camelCase — it is a domain instruction rather than a column, because geometry
 * never syncs.
 *
 * ## The acknowledgements a caller could not previously send
 *
 * The old PATCH hard-coded `acknowledgedHistoricalLabelChange` and both trap
 * semantics flags to `true`, so a client had no way to withhold one and the
 * domain's guard could never fire. Here they are read from the body under the
 * shared convention — absent means confirmed, an explicit `false` means "I have
 * not confirmed this yet" — which preserves what the old route did while making
 * the refusal reachable.
 *
 * `acknowledgedDuplicateTrapCode` is the one exception, and reads `=== true`:
 * the domain defaults it to `false`, the old POST already read it that way, and
 * it guards a collision the user should be shown rather than one the request
 * should be assumed to have accepted. Worth knowing that nothing on the server
 * reads any of these flags off the payload yet — the check they exist for is
 * unimplemented — so the reading is a convention today and a guard when it lands.
 */

import {
	type AdultSurveillanceCommand,
	createTrapCommand,
	deleteTrapCommand,
	reactivateTrapCommand,
	retireTrapCommand,
	type TrapLocationSourceInput,
	updateTrapConfigurationCommand,
	updateTrapDetailsCommand,
} from '@simmer-mosquito/domain';
import type { SafeTrap } from '../adult-surveillance-commands/shared.js';
import { writeTrapCommand } from '../adult-surveillance-commands/traps.js';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

export function trapTableCommands(
	db: CommandDb,
): TableCommands<AdultSurveillanceCommand, SafeTrap> {
	return {
		table: 'traps',
		run: { db, write: writeTrapCommand, notFound: 'trap_not_found', key: 'trap' },
		intents: {
			'adultSurveillance.createTrap': ({ payload, agency, id }) =>
				createTrapCommand({
					...agency,
					trapId: id,
					locationSource: payload.locationSource as TrapLocationSourceInput,
					collectionMethodId: readText(payload.collection_method_id) ?? '',
					addressId: readNullableText(payload.address_id),
					collectionLureId: readNullableText(payload.collection_lure_id),
					trapName: readNullableText(payload.trap_name),
					trapCode: readNullableText(payload.trap_code),
					description: readNullableText(payload.description),
					acknowledgedDuplicateTrapCode: payload.acknowledgedDuplicateTrapCode === true,
				}),

			// A trap's label is what a historical collection is read back under, so
			// renaming one is not the same kind of edit as moving it. Two commands
			// rather than one PATCH, each reading its own half of the body.
			'adultSurveillance.updateTrapDetails': ({ payload, agency, id }) =>
				updateTrapDetailsCommand({
					...agency,
					trapId: id,
					...('trap_name' in payload ? { trapName: readNullableText(payload.trap_name) } : {}),
					...('trap_code' in payload ? { trapCode: readNullableText(payload.trap_code) } : {}),
					...('description' in payload
						? { description: readNullableText(payload.description) }
						: {}),
					acknowledgedHistoricalLabelChange: acknowledged(
						payload.acknowledgedHistoricalLabelChange,
					),
				}),

			'adultSurveillance.updateTrapConfiguration': ({ payload, agency, id }) =>
				updateTrapConfigurationCommand({
					...agency,
					trapId: id,
					...('locationSource' in payload
						? { locationSource: payload.locationSource as TrapLocationSourceInput }
						: {}),
					...('collection_method_id' in payload
						? { collectionMethodId: readText(payload.collection_method_id) ?? '' }
						: {}),
					...('address_id' in payload ? { addressId: readNullableText(payload.address_id) } : {}),
					...('collection_lure_id' in payload
						? { collectionLureId: readNullableText(payload.collection_lure_id) }
						: {}),
					acknowledgedTrapLocationSemanticsChange: acknowledged(
						payload.acknowledgedTrapLocationSemanticsChange,
					),
					acknowledgedTrapMethodSemanticsChange: acknowledged(
						payload.acknowledgedTrapMethodSemanticsChange,
					),
				}),

			'adultSurveillance.retireTrap': ({ agency, id }) =>
				retireTrapCommand({ ...agency, trapId: id }),

			'adultSurveillance.reactivateTrap': ({ payload, agency, id }) =>
				reactivateTrapCommand({
					...agency,
					trapId: id,
					acknowledgedDuplicateTrapCode: payload.acknowledgedDuplicateTrapCode === true,
				}),

			'adultSurveillance.deleteTrap': ({ payload, agency, id }) =>
				deleteTrapCommand({
					...agency,
					trapId: id,
					acknowledgedCascadeDelete: acknowledged(payload.acknowledgedCascadeDelete),
				}),
		},
	};
}
