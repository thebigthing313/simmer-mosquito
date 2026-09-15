import { type RawBuilder, sql } from 'kysely';

// --- tag membership ----------------------------------------------------------
//
// A Tag is pinned to a record through `tag_items`, which is polymorphic: one
// table, an `entity_type` discriminator and an `entity_id`. "Only the records
// carrying one of these tags" is therefore the same correlated `exists` on every
// surface that offers a tag filter, differing in the alias and in the snake_case
// spelling the discriminator holds. Habitats and service requests each wrote it
// out before #963 put the second copy beside the first.

/**
 * Match records carrying any of `tagIds`, or nothing when there are none.
 *
 * `entityType` is the **snake_case** spelling the column holds, which is what
 * `toDbEntityType` produces from the domain's camelCase vocabulary. A camelCase
 * value here matches nothing and reads exactly like an untagged record.
 *
 * No organization predicate: `entity_id` names a row the surface's scope has
 * already narrowed, and `tag_items_entity_idx` is `(entity_type, entity_id)
 * where deleted_at is null`, which is exactly this lookup.
 */
export function tagMembershipClauses(input: {
	/** The record's id column, e.g. ``sql`h.id` ``. */
	readonly id: RawBuilder<unknown>;
	readonly entityType: string;
	readonly tagIds: readonly string[] | undefined;
}): RawBuilder<boolean>[] {
	if (input.tagIds === undefined) {
		return [];
	}
	return [
		sql<boolean>`exists (
			select 1
			from tag_items ti
			where ti.entity_type = ${sql.lit(input.entityType)}
				and ti.entity_id = ${input.id}
				and ti.deleted_at is null
				and ti.tag_id = any(${[...input.tagIds]}::uuid[])
		)`,
	];
}
