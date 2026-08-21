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
 * a URL, a verb or an intent — `packages/sync` derives all three from the table.
 * The row is on screen before the round trip, and a txid confirmation that
 * arrives late is treated as pending rather than as failure.
 *
 * ## Every write names the command it means
 *
 * `metadata.intents` is required, and `requireIntents` throws without it — an
 * unnamed write is a malformed request rather than one with a missing option.
 * Naming the command is what stops the server inferring intent from which fields
 * arrived, which is the whole reason `/commands/{table}` exists. It is also the
 * only thing here a form could not have told us.
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
		genera.insert(
			{
				id: crypto.randomUUID(),
				name: values.name,
				abbreviation: values.abbreviation,
				created_at: now,
				updated_at: now,
			} satisfies Genus,
			{ metadata: { intents: ['foundation.createGenus'] } },
		),
	);
}

export async function updateGenus(genusId: string, values: GenusValues): Promise<void> {
	await settleWrite(
		genera.update(genusId, { metadata: { intents: ['foundation.updateGenus'] } }, (draft) => {
			const row = draft as { -readonly [K in keyof Genus]: Genus[K] };
			row.name = values.name;
			row.abbreviation = values.abbreviation;
		}),
	);
}

export async function deleteGenus(genusId: string): Promise<void> {
	await settleWrite(genera.delete(genusId, { metadata: { intents: ['foundation.deleteGenus'] } }));
}

export async function createSpecies(values: SpeciesValues): Promise<void> {
	const now = new Date();
	await settleWrite(
		species.insert(
			{
				id: crypto.randomUUID(),
				genus_id: values.genusId,
				epithet: values.epithet,
				common_name: values.commonName,
				display_name: values.displayName,
				created_at: now,
				updated_at: now,
			} satisfies Species,
			{ metadata: { intents: ['foundation.createSpecies'] } },
		),
	);
}

export async function updateSpecies(speciesId: string, values: SpeciesValues): Promise<void> {
	await settleWrite(
		species.update(speciesId, { metadata: { intents: ['foundation.updateSpecies'] } }, (draft) => {
			const row = draft as { -readonly [K in keyof Species]: Species[K] };
			row.genus_id = values.genusId;
			row.epithet = values.epithet;
			row.common_name = values.commonName;
			row.display_name = values.displayName;
		}),
	);
}

export async function deleteSpecies(speciesId: string): Promise<void> {
	await settleWrite(
		species.delete(speciesId, { metadata: { intents: ['foundation.deleteSpecies'] } }),
	);
}

export async function createUnit(values: UnitValues): Promise<void> {
	await settleWrite(
		units.insert(
			{
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
			{ metadata: { intents: ['foundation.createUnit'] } },
		),
	);
}

export async function updateUnit(unitId: string, values: UnitValues): Promise<void> {
	await settleWrite(
		units.update(unitId, { metadata: { intents: ['foundation.updateUnit'] } }, (draft) => {
			const row = draft as { -readonly [K in keyof Unit]: Unit[K] };
			row.code = values.code;
			row.unit_name = values.unitName;
			row.abbreviation = values.abbreviation;
			row.unit_type = values.unitType;
			row.unit_system = values.unitSystem;
		}),
	);
}

export async function deleteUnit(unitId: string): Promise<void> {
	await settleWrite(units.delete(unitId, { metadata: { intents: ['foundation.deleteUnit'] } }));
}
