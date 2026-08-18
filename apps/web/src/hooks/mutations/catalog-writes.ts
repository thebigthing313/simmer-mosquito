/**
 * What every lookup catalog's write does, minus the row.
 *
 * The mirror of `hooks/queries/use-catalog-rosters.ts`: one question asked of
 * eight tables, so it is answered once. The eight are the three org lookups
 * (`collection_methods`, `collection_lures`, `habitat_types`), the four control
 * methods, and `notification_types`.
 *
 * ## The lifecycle is a command, not a column
 *
 * Every one of these pages used to save `is_active` and let the server work out
 * which way it moved — `deactivate` when the boolean pointed down, `reactivate`
 * when it pointed up, and a 400 when it was absent. That is the inference this
 * branch removes, so the direction is named here and the column is only written
 * so the row on screen moves before the server answers.
 *
 * Which means a save that renames a row *and* retires it is two commands against
 * one row, and has to travel as one write — TanStack DB merges two updates to a
 * key and keeps only the last `metadata`, so as two calls the rename would arrive
 * under the retirement's name and be dropped behind a 200.
 *
 * ## A create can also be two commands
 *
 * Every one of these dialogs offers an Active switch while creating, and the old
 * POST body had no `is_active` in it at all — so a row created inactive was
 * written active, and the switch the user had just turned off flicked back on
 * when the write synced. Naming `deactivate` beside `create` is what makes the
 * switch mean something, and both commit in the one transaction the request runs.
 *
 * ## Why the row is built by the caller
 *
 * These eight tables are four different shapes — `action_threshold` is on
 * collection methods alone, `custom_schema` is on five of them, the control
 * methods have no `description`. A generic row builder would have to assemble the
 * literal from a column descriptor and cast it, and the cast is exactly what let
 * camelCase rows through in silence. So each hook writes its own literal with
 * `satisfies`, and hands it here already typed.
 */

import type { SingleRowCommandType } from '@simmer-mosquito/domain';
import { settleWrite } from '@simmer-mosquito/sync';
import { mutateCollection } from '../../lib/collections/mutate';
import { optimisticStamp } from './shared';

/** A collection this module can write, as `mutateCollection` needs it. */
export type CatalogCollection<TRow extends object> = Parameters<typeof mutateCollection<TRow>>[0];

/** The five commands every one of these catalogs answers to. */
export interface CatalogCommandNames {
	readonly create: SingleRowCommandType;
	readonly update: SingleRowCommandType;
	readonly deactivate: SingleRowCommandType;
	readonly reactivate: SingleRowCommandType;
	readonly remove: SingleRowCommandType;
}

/**
 * The columns every one of these rows carries, whatever else it has.
 *
 * `TRow extends CatalogRow` is what makes the two `as Partial<TRow>` casts below
 * sound: a generic `Partial<TRow>` cannot be satisfied by a literal, but the
 * constraint guarantees both keys exist on every catalog and are these types. It
 * is the one place in this folder a change set is not written out under
 * `satisfies`, and it names two columns rather than accepting a shape.
 */
export interface CatalogRow {
	readonly id: string;
	readonly is_active: boolean;
	readonly updated_at: Date;
}

/**
 * Create a catalog row, retiring it in the same write when it was created
 * inactive.
 */
export async function createCatalogRow<TRow extends CatalogRow>(
	collection: CatalogCollection<TRow>,
	names: CatalogCommandNames,
	row: TRow,
): Promise<void> {
	await settleWrite(
		mutateCollection(collection, {
			operation: 'insert',
			intent: row.is_active ? names.create : [names.create, names.deactivate],
			row,
		}),
	);
}

/**
 * Save an edited catalog row.
 *
 * `changes` carries only the detail columns, and only when one of them moved:
 * the domain refuses an update with nothing to change, so naming it on a save
 * that only flipped the switch would fail the whole write. `wasActive` is what
 * decides whether a lifecycle command is named at all — an unchanged switch is
 * not a command.
 */
export async function saveCatalogRow<TRow extends CatalogRow>(
	collection: CatalogCollection<TRow>,
	names: CatalogCommandNames,
	id: string,
	options: {
		/** The detail columns that moved, or an empty object when none did. */
		readonly changes: Partial<TRow>;
		readonly isActive: boolean;
		readonly wasActive: boolean;
	},
): Promise<void> {
	const intents: SingleRowCommandType[] = [];
	const detailsMoved = Object.keys(options.changes).length > 0;

	if (detailsMoved) {
		intents.push(names.update);
	}
	if (options.isActive !== options.wasActive) {
		intents.push(options.isActive ? names.reactivate : names.deactivate);
	}

	if (intents.length === 0) {
		return;
	}

	await settleWrite(
		mutateCollection(collection, {
			operation: 'update',
			intent: intents,
			key: id,
			changes: {
				...options.changes,
				// Written whether or not the lifecycle command was named: an update
				// whose changes are all lifecycle would otherwise be a write with no
				// diff, and TanStack DB sends nothing for one.
				is_active: options.isActive,
				updated_at: optimisticStamp(),
			} as Partial<TRow>,
		}),
	);
}

/** Retire a catalog row, or put it back — the reversible one-click toggle. */
export async function setCatalogRowActive<TRow extends CatalogRow>(
	collection: CatalogCollection<TRow>,
	names: CatalogCommandNames,
	id: string,
	isActive: boolean,
): Promise<void> {
	await settleWrite(
		mutateCollection(collection, {
			operation: 'update',
			intent: isActive ? names.reactivate : names.deactivate,
			key: id,
			changes: { is_active: isActive, updated_at: optimisticStamp() } as Partial<TRow>,
		}),
	);
}

export async function deleteCatalogRow<TRow extends CatalogRow>(
	collection: CatalogCollection<TRow>,
	names: CatalogCommandNames,
	id: string,
): Promise<void> {
	await settleWrite(
		mutateCollection(collection, { operation: 'delete', intent: names.remove, key: id }),
	);
}
