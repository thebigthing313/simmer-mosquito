import { type SelectedRow, sql } from '@simmer-mosquito/db';
/**
 * The `units` table, as commands — the third operator table.
 *
 * The global catalog of units of measure. No `organization_id`, and every
 * organization records amounts against them, so an edit here is SIMMER's to
 * make. Same door as the taxonomy: `actor: 'operator'`, and the three commands
 * are typed on `OperatorFoundationCommandInput`.
 *
 * ## What this retires
 *
 * `/admin/units` was the last `/admin/*` write surface, and the last place a row
 * was written with no domain command, no permission map entry and no actor — the
 * same second door `/admin/genera` and `/admin/species` were. The three routes
 * are gone, `admin-foundations.ts` is reads only, and `deleteOrExplain` went with
 * them: the 409 it produced is `refusableWrite` here.
 *
 * ## Three unique indexes, and one of them means something
 *
 * `code`, `unit_name` and `abbreviation` are each unique, so `23505` is a routine
 * answer on this table rather than an exceptional one — which is why the create
 * and update pass a `duplicate` refusal and the delete passes `inUse`.
 *
 * `code` is also the key `organization-settings/unit-conversion.ts` matches on,
 * because the table deliberately carries no factor and no base-unit column. The
 * domain guards a change to it with `acknowledgedUnitCodeChange`; that guard is
 * the whole reason the field is read separately from the other four rather than
 * spread with them.
 *
 * ## Field names
 *
 * Postgres column names: `code`, `unit_name`, `abbreviation`, `unit_type`,
 * `unit_system`. There is no `updated_at` on this table — units are reference
 * data that is corrected, not a record with a history — so nothing stamps one.
 */

import {
	createUnitCommand,
	deleteUnitCommand,
	type FoundationCommand,
	updateUnitCommand,
} from '@simmer-mosquito/domain';
import { CommandError } from '../command-endpoint.js';
import { readText } from '../command-payload.js';
import type { CommandDb, CommandTransaction } from '../command-write.js';
import type { OperatorTableCommands } from './dispatch.js';
import { acknowledged, refusableWrite } from './shared.js';

const UNIT_COLUMNS = [
	'id',
	'code',
	'unit_name',
	'abbreviation',
	'unit_type',
	'unit_system',
	'created_at',
] as const;

type UnitRow = SelectedRow<'units', typeof UNIT_COLUMNS>;

/** What a caller is told when one of the three unique indexes refuses. */
const duplicate = {
	error: 'unit_already_exists',
	reason: 'A unit already uses that code, name, or abbreviation. Each must be unique.',
} as const;

/**
 * One refusal for two paths.
 *
 * A foreign key raises it for a unit an organization measures in;
 * `assertUnitNotChosen` raises it for one an organization has merely chosen.
 * The operator is told the same thing either way, because the difference is
 * ours and not theirs.
 */
const UNIT_IN_USE = {
	error: 'unit_in_use',
	reason: "This unit is still referenced by an organization's records or settings.",
} as const;

async function writeUnitCommand(
	trx: CommandTransaction,
	command: FoundationCommand,
): Promise<UnitRow | null> {
	switch (command.type) {
		case 'foundation.createUnit': {
			const row = await refusableWrite(
				() =>
					trx
						.insertInto('units')
						.values({
							id: command.payload.unitId,
							code: command.payload.code,
							unit_name: command.payload.unitName,
							abbreviation: command.payload.abbreviation,
							unit_type: command.payload.unitType,
							unit_system: command.payload.unitSystem,
						})
						.returning(UNIT_COLUMNS)
						.executeTakeFirstOrThrow(),
				{ duplicate },
			);
			return row;
		}
		case 'foundation.updateUnit': {
			const changes = command.payload.changes;
			const row = await refusableWrite(
				() =>
					trx
						.updateTable('units')
						.set({
							...('code' in changes ? { code: changes.code } : {}),
							...('unitName' in changes ? { unit_name: changes.unitName } : {}),
							...('abbreviation' in changes ? { abbreviation: changes.abbreviation } : {}),
							...('unitType' in changes ? { unit_type: changes.unitType } : {}),
							...('unitSystem' in changes ? { unit_system: changes.unitSystem } : {}),
						})
						.where('id', '=', command.payload.unitId)
						.returning(UNIT_COLUMNS)
						.executeTakeFirst(),
				{ duplicate },
			);
			return row ?? null;
		}
		// A hard delete, like the taxonomy: no `deleted_at`, and the foreign keys
		// refuse a unit an organization still measures in. A unit an organization
		// has merely *chosen* has no foreign key to refuse it, so
		// `assertUnitNotChosen` reads the settings documents first. See #131.
		case 'foundation.deleteUnit': {
			await assertUnitNotChosen(trx, command.payload.unitId);
			const row = await refusableWrite(
				() =>
					trx
						.deleteFrom('units')
						.where('id', '=', command.payload.unitId)
						.returning(UNIT_COLUMNS)
						.executeTakeFirst(),
				{ inUse: UNIT_IN_USE },
			);
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported unit command: ${command.type}`);
	}
}

/**
 * Refuse a unit any organization has chosen as a default.
 *
 * Nine columns reference `units` by foreign key and every one of them is a
 * record, so Postgres refuses those itself. `organizations.settings ->
 * 'unitDefaults'` holds unit **codes in a JSON document**, so nothing
 * references the row and nothing refuses: the delete succeeded and the
 * organization's default silently named a unit that was gone.
 *
 * This is one cross-table invariant enforced in one handler, which is the kind
 * of thing that drifts the moment a second writer appears. It is written this
 * way because the reference is a string inside a document, so the delete
 * registry, which counts rows, cannot see it.
 *
 * The refusal reports that the unit is in use and names no organization: an
 * operator needs to know the row is spoken for, not which customer spoke for
 * it. An organization that is inactive still counts, because an organization
 * coming back to find its area default gone is the failure this prevents.
 */
async function assertUnitNotChosen(trx: CommandTransaction, unitId: string): Promise<void> {
	const chosen = await trx
		.selectFrom('organizations')
		.select('organizations.id')
		.where('organizations.deleted_at', 'is', null)
		.where(
			sql<boolean>`exists (
				select 1
				from jsonb_each_text(
					coalesce(organizations.settings -> 'unitDefaults', '{}'::jsonb)
				) as chosen(setting, code)
				where chosen.code = (select u.code from units u where u.id = ${sql.val(unitId)})
			)`,
		)
		.limit(1)
		.executeTakeFirst();

	if (chosen !== undefined) {
		throw new CommandError(409, UNIT_IN_USE);
	}
}

export function unitTableCommands(
	db: CommandDb,
): OperatorTableCommands<'units', FoundationCommand, UnitRow> {
	return {
		table: 'units',
		actor: 'operator',
		run: { db, write: writeUnitCommand, notFound: 'unit_not_found', key: 'unit' },
		intents: {
			'foundation.createUnit': ({ payload, operatorUserId, id }) =>
				createUnitCommand({
					operatorUserId,
					unitId: id,
					code: readText(payload.code) ?? '',
					unitName: readText(payload.unit_name) ?? '',
					abbreviation: readText(payload.abbreviation) ?? '',
					unitType: readText(payload.unit_type) ?? '',
					unitSystem: readText(payload.unit_system) ?? '',
				}),

			'foundation.updateUnit': ({ payload, operatorUserId, id }) =>
				updateUnitCommand({
					operatorUserId,
					unitId: id,
					...(payload.code !== undefined ? { code: readText(payload.code) ?? '' } : {}),
					...(payload.unit_name !== undefined
						? { unitName: readText(payload.unit_name) ?? '' }
						: {}),
					...(payload.abbreviation !== undefined
						? { abbreviation: readText(payload.abbreviation) ?? '' }
						: {}),
					...(payload.unit_type !== undefined
						? { unitType: readText(payload.unit_type) ?? '' }
						: {}),
					...(payload.unit_system !== undefined
						? { unitSystem: readText(payload.unit_system) ?? '' }
						: {}),
					// Guarded by the domain, and only when `code` is among the changes —
					// so an edit that leaves the code alone never has to carry this.
					acknowledgedUnitCodeChange: acknowledged(payload, 'acknowledgedUnitCodeChange'),
				}),

			'foundation.deleteUnit': ({ operatorUserId, id }) =>
				deleteUnitCommand({ operatorUserId, unitId: id }),
		},
	};
}
