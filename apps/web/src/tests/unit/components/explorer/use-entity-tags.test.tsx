/** @vitest-environment jsdom */

/**
 * The explorer's read: the Tags on a page of records, keyed by record.
 *
 * `useRecordTags` asks about one record and hands back a list. This asks about
 * the ids on screen and hands back a lookup, which is the shape a list of rows
 * needs. The join is the same one and is `inner` for the same reason, so the
 * unmatched row is asserted here too rather than left to the sibling suite.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useEntityTags } from '../../../../components/explorer/use-entity-tags';
import { tag_items } from '../../../../lib/collections/tag_items';
import { tags } from '../../../../lib/collections/tags';
import { renderRead } from '../../hooks/queries/read-harness';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const OFF_PAGE = '33333333-3333-4333-8333-333333333333';

function tag(id: string, name: string) {
	return { id, tag_name: name, color: null, description: null };
}

function tagItem(id: string, entityId: string, tagId: string, entityType = 'habitat') {
	return { id, entity_id: entityId, entity_type: entityType, tag_id: tagId };
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useEntityTags', () => {
	it('groups the assignments by the record they are on', async () => {
		seedRows(tags, [tag('t1', 'Roadside'), tag('t2', 'Alder')]);
		seedRows(tag_items, [
			tagItem('i1', FIRST, 't1'),
			tagItem('i2', FIRST, 't2'),
			tagItem('i3', SECOND, 't2'),
		]);

		const { result } = await renderRead(() => useEntityTags('habitat', [FIRST, SECOND]));

		expect(result.current.byId.get(FIRST)?.map((row) => row.name)).toEqual(['Alder', 'Roadside']);
		expect(result.current.byId.get(SECOND)?.map((row) => row.name)).toEqual(['Alder']);
		expect(result.current.isReady).toBe(true);
	});

	it('drops an assignment whose catalog row it does not hold', async () => {
		// The `'inner'` third argument is what does this. Without it `.join()` in
		// `@tanstack/db` defaults to `left`, the unmatched row is emitted, and the
		// `coalesce` labels it "Unknown tag" on a row in a list. The `coalesce`
		// calls stay because the builder types a joined column as possibly absent
		// whatever the join kind, so this is the assertion that says they are
		// unreachable.
		seedRows(tags, [tag('t1', 'Roadside')]);
		seedRows(tag_items, [tagItem('i1', FIRST, 't1'), tagItem('i2', FIRST, 'not-synced')]);

		const { result } = await renderRead(() => useEntityTags('habitat', [FIRST]));

		expect(result.current.byId.get(FIRST)?.map((row) => row.name)).toEqual(['Roadside']);
	});

	it('is scoped to the ids on screen and to the entity type', async () => {
		seedRows(tags, [tag('t1', 'Roadside'), tag('t2', 'Alder')]);
		seedRows(tag_items, [
			tagItem('i1', FIRST, 't1'),
			tagItem('i2', OFF_PAGE, 't2'),
			tagItem('i3', SECOND, 't2', 'trap'),
		]);

		const { result } = await renderRead(() => useEntityTags('habitat', [FIRST, SECOND]));

		expect([...result.current.byId.keys()]).toEqual([FIRST]);
	});

	it('is empty rather than everything while the page has no ids yet', async () => {
		// An empty `IN` list is not a valid predicate, so the hook substitutes an id
		// no row carries. Passing the list through unchanged would match nothing in
		// SQL and everything here.
		seedRows(tags, [tag('t1', 'Roadside')]);
		seedRows(tag_items, [tagItem('i1', FIRST, 't1')]);

		const { result } = await renderRead(() => useEntityTags('habitat', []));

		expect(result.current.byId.size).toBe(0);
	});
});
