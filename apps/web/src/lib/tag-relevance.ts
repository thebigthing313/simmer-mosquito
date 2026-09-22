/**
 * Which record types a Tag is meant for, as this app reads the set.
 *
 * `tags.relevant_entity_types` holds the six taggable targets the way
 * `tag_items.entity_type` spells them, which is snake_case, while every label on
 * screen comes from `RECORD_NOUNS`, which is keyed camelCase. The pair below is
 * the one place those two spellings meet, so nothing else converts and nothing
 * spells a record noun.
 *
 * Nothing here enforces anything. The set is a preference: it decides which
 * Tags the picker offers first and what the Tags table shows under
 * `Suggested For`, and any active Tag still goes on any taggable record. See
 * `docs/tag-relevance-spec.md`.
 */

import { TAG_TARGET_TYPES, toDbEntityType } from '@simmer-mosquito/domain';
import { type RecordType, recordNoun } from './record-nouns';

/**
 * The six, in register order, each with the word the column holds.
 *
 * Derived from the domain register rather than listed again, so a target the
 * domain adds or drops arrives here on its own. Register order is what the
 * column stores and what the table's cell reads, so two Tags with the same set
 * read the same way.
 */
export const TAG_RELEVANCE_TARGETS: readonly {
	readonly recordType: RecordType;
	readonly entityType: string;
}[] = TAG_TARGET_TYPES.map((recordType) => ({
	recordType,
	entityType: toDbEntityType(recordType),
}));

/** The six as a `MultiSelect` takes them, labelled from the register. */
export const TAG_RELEVANCE_OPTIONS: readonly {
	readonly value: string;
	readonly label: string;
}[] = TAG_RELEVANCE_TARGETS.map(({ recordType, entityType }) => ({
	value: entityType,
	label: recordNoun(recordType).titleMany,
}));

/** What a Tag row shows under `Suggested For`. The empty set is every record. */
export function relevanceSummary(relevantEntityTypes: readonly string[]): string {
	if (relevantEntityTypes.length === 0) {
		return 'All records';
	}

	return TAG_RELEVANCE_TARGETS.filter(({ entityType }) => relevantEntityTypes.includes(entityType))
		.map(({ recordType }) => recordNoun(recordType).titleMany)
		.join(', ');
}

/**
 * Whether a Tag is one to offer first on a record of this type.
 *
 * An empty set is relevant everywhere, which is what a new Tag gets and what
 * every Tag in an Organization that has never edited the field has. A rule that
 * read the empty set as "relevant to nothing" would draw a picker with an empty
 * suggested section on a catalog nobody has done anything wrong to.
 */
export function isRelevantTo(
	relevantEntityTypes: readonly string[],
	recordType: RecordType,
): boolean {
	return (
		relevantEntityTypes.length === 0 || relevantEntityTypes.includes(toDbEntityType(recordType))
	);
}

/** The two lists a tag picker draws, out of the catalog it was handed. */
export interface TagPickerSections<TTag> {
	/** Suggested for this record type, and the empty set counts. */
	readonly relevant: readonly TTag[];
	/** The rest of what is listed, which is where an assigned inactive Tag sits. */
	readonly rest: readonly TTag[];
}

/**
 * The picker's two sections, from the catalog, what is already on the record and
 * what has been typed in the search box.
 *
 * Pure, and out here rather than inside the dialog, because every rule in it is
 * a decision somebody made: what an inactive Tag does, what an empty relevance
 * set means, and what a search matches. `tag-relevance.test.ts` is those rules.
 *
 * Active Tags are the ones on offer. An inactive one is listed only where it is
 * already assigned, which is the catalog's own rule: inactive means "not
 * available for new assignments", never hidden from history. It draws in `rest`
 * whatever its relevant set says, because relevance is a preference about
 * offering a Tag and an inactive one is never offered.
 *
 * A match is a case-insensitive substring of the name or of the description.
 * Names here are short and often compound, so a word-prefix rule would miss
 * `culex` inside `Treated - culex`, and the description is in the match because
 * the row draws it.
 */
export function tagPickerSections<
	TTag extends {
		readonly id: string;
		readonly name: string;
		readonly description: string | null;
		readonly isActive: boolean;
		readonly relevantEntityTypes: readonly string[];
	},
>(
	catalog: readonly TTag[],
	assignedTagIds: ReadonlySet<string>,
	recordType: RecordType,
	search: string,
): TagPickerSections<TTag> {
	const needle = search.trim().toLowerCase();
	const matches = (tag: TTag) =>
		needle.length === 0 ||
		tag.name.toLowerCase().includes(needle) ||
		(tag.description ?? '').toLowerCase().includes(needle);

	const listed = catalog.filter(
		(tag) => (tag.isActive || assignedTagIds.has(tag.id)) && matches(tag),
	);

	return {
		relevant: listed.filter(
			(tag) => tag.isActive && isRelevantTo(tag.relevantEntityTypes, recordType),
		),
		rest: listed.filter(
			(tag) => !tag.isActive || !isRelevantTo(tag.relevantEntityTypes, recordType),
		),
	};
}
