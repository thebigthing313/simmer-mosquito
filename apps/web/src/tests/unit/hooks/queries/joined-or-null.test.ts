/**
 * `joinedOrNull`, the projection of a column from the optional side of a `left`
 * join.
 *
 * What it has to hold is the type. `coalesce(column, null)` answers `null` for
 * an unmatched join and is typed as the column's own type, so a column that is
 * non-null in its row schema reaches a reader typed `string` and arrives as
 * `null`. The helper's projection is `T | null` for a non-null column and for a
 * nullable one, and evaluates as the bare `coalesce` does.
 *
 * Two local-only collections stand in for synced ones, because the type gap is
 * `@tanstack/db`'s and nothing about Electric changes it.
 */

import {
	createCollection,
	createLiveQueryCollection,
	eq,
	localOnlyCollectionOptions,
} from '@tanstack/react-db';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { joinedOrNull } from '../../../../hooks/queries/shared';

interface Owner {
	id: string;
	label: string;
	note: string | null;
}

interface Item {
	id: string;
	owner_id: string | null;
}

function joinedItems() {
	const owners = createCollection(
		localOnlyCollectionOptions<Owner>({
			id: 'joined-or-null-owners',
			getKey: (owner) => owner.id,
			initialData: [{ id: 'owner-1', label: 'North', note: 'gated' }],
		}),
	);
	const items = createCollection(
		localOnlyCollectionOptions<Item>({
			id: 'joined-or-null-items',
			getKey: (item) => item.id,
			initialData: [
				{ id: 'matched', owner_id: 'owner-1' },
				{ id: 'unmatched', owner_id: null },
			],
		}),
	);

	return createLiveQueryCollection({
		startSync: true,
		query: (q) =>
			q
				.from({ item: items })
				.join({ owner: owners }, ({ item, owner }) => eq(item.owner_id, owner.id), 'left')
				.select(({ item, owner }) => ({
					id: item.id,
					label: joinedOrNull(owner.label),
					note: joinedOrNull(owner.note),
				})),
	});
}

type Row = ReturnType<typeof joinedItems> extends { toArray: Array<infer TRow> } ? TRow : never;

describe('joinedOrNull', () => {
	it('types a non-null and a nullable joined column as `T | null`', () => {
		expectTypeOf<Row['label']>().toEqualTypeOf<string | null>();
		expectTypeOf<Row['note']>().toEqualTypeOf<string | null>();
	});

	it('answers `null` for an unmatched join and the value for a matched one', async () => {
		const live = joinedItems();
		await live.toArrayWhenReady();

		const byId = new Map(live.toArray.map((row) => [row.id, row]));

		expect(byId.get('matched')).toMatchObject({ id: 'matched', label: 'North', note: 'gated' });
		expect(byId.get('unmatched')).toMatchObject({ id: 'unmatched', label: null, note: null });
	});
});
