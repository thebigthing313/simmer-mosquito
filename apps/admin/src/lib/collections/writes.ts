/**
 * The other half of the read seam.
 *
 * `hooks/queries` turns Postgres columns into the vocabulary a page speaks;
 * this turns a page's values back into columns. One place knows both spellings,
 * which is the whole point — without it the route components would be assigning
 * `row.display_name` again, and that is how the reads got into trouble.
 *
 * It sits beside the collections rather than in `hooks/queries` because nothing
 * here is a hook or a query: these are plain functions a form's submit handler
 * awaits. `apps/web` keeps its equivalent in this folder too (`mutate.ts`).
 *
 * ## What a write is
 *
 * An optimistic mutation on the collection, settled through `settleWrite`. The
 * collection's own handlers turn it into a command request, so nothing here names
 * a URL or a verb; `packages/sync` derives both from the table. The row is on
 * screen before the round trip, and a txid confirmation that arrives late is
 * treated as pending rather than as failure.
 *
 * ## Every write names the command it means
 *
 * The command is an argument to `mutateCollection` rather than a string in a
 * metadata bag, so a name outside `SingleRowCommandType` fails `tsc`. Naming it
 * is what stops the server inferring intent from which fields arrived, which is
 * the whole reason `/commands/{table}` exists. It is also the only thing here a
 * form could not have told us. `requireIntents` still throws on a write that
 * names none, but it fires once the write is in flight; `mutate.ts` is the same
 * rule expressed where it can be enforced.
 *
 * ## Two things the caller does not supply
 *
 * **Ids are minted here.** A create carries the row's `id` in its body, because
 * `/commands/{table}` has no path parameter on a POST and SIMMER writes carry
 * their own ids so they are replay-safe.
 *
 * **Timestamps are the optimistic row's only.** The server writes its own with
 * its own clock; these exist so the row on screen is a complete row until the
 * synced one replaces it. Nothing should ever read them.
 */

import { type Genus, type Species, settleWrite, type Unit } from '@simmer-mosquito/sync';
import { genera } from './genera';
import { mutateCollection } from './mutate';
import { species } from './species';
import { units } from './units';

/** The enums as the row schema spells them, so the forms track the table. */
export type UnitType = Unit['unit_type'];
export type UnitSystem = Unit['unit_system'];

export interface GenusValues {
	readonly name: string;
	readonly abbreviation: string;
}

export interface SpeciesValues {
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
}

export interface UnitValues {
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

export async function createGenus(values: GenusValues): Promise<void> {
	const now = new Date();
	await settleWrite(
		mutateCollection(genera, {
			operation: 'insert',
			intent: 'foundation.createGenus',
			row: {
				id: crypto.randomUUID(),
				name: values.name,
				abbreviation: values.abbreviation,
				created_at: now,
				updated_at: now,
			} satisfies Genus,
		}),
	);
}

export async function updateGenus(genusId: string, values: GenusValues): Promise<void> {
	await settleWrite(
		mutateCollection(genera, {
			operation: 'update',
			intent: 'foundation.updateGenus',
			key: genusId,
			changes: { name: values.name, abbreviation: values.abbreviation },
		}),
	);
}

export async function deleteGenus(genusId: string): Promise<void> {
	await settleWrite(
		mutateCollection(genera, {
			operation: 'delete',
			intent: 'foundation.deleteGenus',
			key: genusId,
		}),
	);
}

export async function createSpecies(values: SpeciesValues): Promise<void> {
	const now = new Date();
	await settleWrite(
		mutateCollection(species, {
			operation: 'insert',
			intent: 'foundation.createSpecies',
			row: {
				id: crypto.randomUUID(),
				genus_id: values.genusId,
				epithet: values.epithet,
				common_name: values.commonName,
				display_name: values.displayName,
				created_at: now,
				updated_at: now,
			} satisfies Species,
		}),
	);
}

export async function updateSpecies(speciesId: string, values: SpeciesValues): Promise<void> {
	await settleWrite(
		mutateCollection(species, {
			operation: 'update',
			intent: 'foundation.updateSpecies',
			key: speciesId,
			changes: {
				genus_id: values.genusId,
				epithet: values.epithet,
				common_name: values.commonName,
				display_name: values.displayName,
			},
		}),
	);
}

export async function deleteSpecies(speciesId: string): Promise<void> {
	await settleWrite(
		mutateCollection(species, {
			operation: 'delete',
			intent: 'foundation.deleteSpecies',
			key: speciesId,
		}),
	);
}

export async function createUnit(values: UnitValues): Promise<void> {
	await settleWrite(
		mutateCollection(units, {
			operation: 'insert',
			intent: 'foundation.createUnit',
			row: {
				id: crypto.randomUUID(),
				code: values.code,
				unit_name: values.unitName,
				abbreviation: values.abbreviation,
				unit_type: values.unitType,
				unit_system: values.unitSystem,
				// No `updated_at`: `units` is reference data that is corrected, not a
				// record with a history, so the table has no such column.
				created_at: new Date(),
			} satisfies Unit,
		}),
	);
}

export async function updateUnit(unitId: string, values: UnitValues): Promise<void> {
	await settleWrite(
		mutateCollection(units, {
			operation: 'update',
			intent: 'foundation.updateUnit',
			key: unitId,
			changes: {
				code: values.code,
				unit_name: values.unitName,
				abbreviation: values.abbreviation,
				unit_type: values.unitType,
				unit_system: values.unitSystem,
			},
		}),
	);
}

export async function deleteUnit(unitId: string): Promise<void> {
	await settleWrite(
		mutateCollection(units, {
			operation: 'delete',
			intent: 'foundation.deleteUnit',
			key: unitId,
		}),
	);
}
