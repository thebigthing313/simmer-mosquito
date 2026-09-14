import type { CorpusTable } from '@simmer-mosquito/domain';
import { type RecordType, recordNoun } from '../../lib/record-nouns';

/**
 * The two create routes a palette action can open on a record, and the search
 * param each one reads that record's id under.
 *
 * Two entries, not twelve, and the reason is not effort. A create route only
 * belongs here once somebody has decided what its record seeds off, and that is
 * a domain call per route: an Application seeds off a Habitat, an Inspection, an
 * Address or a Region, and nothing in the code answers which. These two were
 * answered before the palette existed. `inspections-create` validates
 * `habitatId` for the assignment run page, `collections-create` validates
 * `trapId` for the trap detail page's collection history, and both flow through
 * their form's `seededDefaults`.
 *
 * The record type rides along because the step's copy names the record being
 * picked, and a second map from table to record type would be a second thing to
 * keep in step. It is the record type and not the word: `RECORD_NOUNS` in
 * `lib/record-nouns.ts` says what a record is called and this entry says which
 * record it is, so the palette and every other surface spell it the same way.
 */
const SEED_PARAMS = {
	habitats: { param: 'habitatId', recordType: 'habitat' },
	traps: { param: 'trapId', recordType: 'trap' },
} as const satisfies Partial<Record<CorpusTable, { param: string; recordType: RecordType }>>;

/** A corpus table a create form can open on. */
export type SeedableTable = keyof typeof SEED_PARAMS;

/** The word the pick step calls the record it is asking for. */
export function seedNoun(table: SeedableTable): string {
	return recordNoun(SEED_PARAMS[table].recordType).one;
}

/**
 * The search the create route is opened with, for one chosen record.
 *
 * Navigation, and only navigation. The palette dismisses on Enter, so an
 * optimistic write started from a row fails into a surface that is already gone
 * with nowhere to report it. Seeding a form leaves the write where the person
 * can see it fail.
 */
export function seedSearch(table: SeedableTable, recordId: string): Record<string, string> {
	return { [SEED_PARAMS[table].param]: recordId };
}
