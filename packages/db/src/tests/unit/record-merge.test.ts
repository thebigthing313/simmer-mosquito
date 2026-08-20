import { describe, expect, it } from 'vitest';
import {
	deleteReferenceScopes,
	isMergeableRecordType,
	mergeableRecordLabel,
	mergeReferenceScopes,
} from '../../index.js';

/**
 * The three record types a merge command exists for.
 *
 * `foundation.mergeAddresses`, `larvalSurveillance.mergeHabitats` and
 * `publicEngagement.mergeContacts`. Adding a fourth means writing its rules, and
 * failing here is the prompt to do that rather than shipping a record type the
 * engine accepts and moves nothing for.
 */
const MERGEABLE = ['address', 'habitat', 'contact'] as const;

/**
 * Rows a delete rule covers that a merge deliberately does not re-point.
 *
 * Every other referencing table has to appear in both registries, so the list of
 * exceptions is the whole argument for keeping them separate — and it is short
 * enough to read.
 */
const NOT_REPOINTED: Readonly<Record<string, readonly string[]>> = {
	address: [],
	habitat: [],
	// Snapshots of who was told about a mission, and of the address and channel
	// used. A merge tidies the contact book; it does not rewrite what was sent.
	contact: ['mission_notifications'],
};

function tablesOf(scopes: readonly { readonly table: string }[]): readonly string[] {
	return [...new Set(scopes.map((scope) => scope.table))].sort();
}

describe('mergeable record registry', () => {
	it('accepts exactly the record types with a merge command', () => {
		for (const recordType of MERGEABLE) {
			expect(isMergeableRecordType(recordType)).toBe(true);
		}
		expect(isMergeableRecordType('trap')).toBe(false);
		expect(isMergeableRecordType('inspection')).toBe(false);
	});

	it('names every record in domain language', () => {
		for (const recordType of MERGEABLE) {
			const label = mergeableRecordLabel(recordType);
			expect(label.trim()).not.toBe('');
			// Reaches the user through `RecordMergeRefusedError`.
			expect(label).not.toMatch(/[A-Z]/);
		}
	});
});

/**
 * The drift gate.
 *
 * A merge that misses a referencing table leaves rows pointing at a row that has
 * just been soft-deleted, and nothing complains: the FK still resolves, the
 * record simply vanishes from every surface that filters on `deleted_at`. There
 * is no constraint to catch it and no error to read, which is why it is checked
 * against the delete registry here instead.
 *
 * The delete registry is the one that gets maintained, because a missing rule
 * there fails loudly — a delete that should have been blocked goes through. So
 * it is the reference, and merge is held to it.
 */
describe('merge rules cover every table the delete rules do', () => {
	for (const recordType of MERGEABLE) {
		it(`${recordType} re-points every table its delete policy names`, () => {
			// Child-scoped delete rules reach rows a generation below the record.
			// A merge never sees them: the children keep their own parent, and the
			// parent is what moves.
			const deleteTables = tablesOf(
				deleteReferenceScopes(recordType).filter(
					(rule) => rule.scope.kind === 'direct' || rule.scope.kind === 'polymorphic',
				),
			);
			const mergeTables = tablesOf(mergeReferenceScopes(recordType));
			const expected = deleteTables.filter((table) => !NOT_REPOINTED[recordType]?.includes(table));

			expect(mergeTables).toEqual(expected);
		});

		it(`${recordType} reaches each table the same way both policies do`, () => {
			const deleteScopes = new Map(
				deleteReferenceScopes(recordType).map((rule) => [rule.table, rule.scope]),
			);

			for (const { table, scope } of mergeReferenceScopes(recordType)) {
				const deleteScope = deleteScopes.get(table);
				expect(deleteScope, `${table} has no delete rule`).toBeDefined();
				if (deleteScope === undefined) {
					continue;
				}

				// A column on one side and an `entity_type` on the other would mean one
				// of the two is writing the wrong thing, and both would still run.
				if (scope.kind === 'column') {
					expect(deleteScope.kind).toBe('direct');
					if (deleteScope.kind === 'direct') {
						expect(scope.column).toBe(deleteScope.column);
					}
				} else {
					expect(deleteScope.kind).toBe('polymorphic');
					if (deleteScope.kind === 'polymorphic') {
						expect(scope.entityType).toBe(deleteScope.entityType);
					}
				}
			}
		});
	}
});

/**
 * The dedupe keys, pinned to the partial unique indexes they exist for.
 *
 * `tag_items_tag_entity_unique`, `route_items_route_entity_unique` and
 * `assignment_items_assignment_entity_unique` are all `(<key>, entity_type,
 * entity_id) where deleted_at is null`. A move rewrites `entity_id` to one
 * value, so any two rows sharing the key collide, and the merge fails on a
 * constraint violation rather than doing something wrong — but it fails on a
 * merge somebody was halfway through, which is not where to find this out.
 */
describe('support rules dedupe wherever a unique index would collide', () => {
	const UNIQUE_BY: Readonly<Record<string, string>> = {
		tag_items: 'tag_id',
		route_items: 'route_id',
		assignment_items: 'assignment_id',
	};

	for (const recordType of MERGEABLE) {
		it(`${recordType} dedupes by the column its index is keyed on`, () => {
			for (const { table, scope } of mergeReferenceScopes(recordType)) {
				if (scope.kind !== 'support') {
					continue;
				}
				const uniqueColumn = UNIQUE_BY[table];
				if (uniqueColumn === undefined) {
					// `comments` has no unique index: two identical comments on one
					// habitat are two things somebody said, and both move.
					expect(scope.dedupeBy).toBeUndefined();
					continue;
				}
				expect(scope.dedupeBy).toEqual([uniqueColumn]);
			}
		});
	}
});
