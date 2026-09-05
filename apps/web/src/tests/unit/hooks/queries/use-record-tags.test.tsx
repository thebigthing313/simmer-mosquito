/** @vitest-environment jsdom */

/**
 * Field-work support's read: the Tags on one record.
 *
 * One `tag_items` row per tagged record joined to the catalog, so a chip
 * arrives named and coloured. The three things worth holding are the join being
 * `inner` (a tag_item whose catalog row the client does not hold is nothing to
 * draw, not a chip reading "Unknown tag"), the alphabetical order, and the
 * predicate being on `entity_id` rather than on the tag.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useRecordTags } from '../../../../hooks/queries/use-record-tags';
import { tag_items } from '../../../../lib/collections/tag_items';
import { tags } from '../../../../lib/collections/tags';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { plain, renderRead } from './read-harness';

const HABITAT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function tag(id: string, name: string, color: string | null = '#336699') {
	return { id, tag_name: name, color, description: null };
}

function tagItem(id: string, entityId: string, tagId: string) {
	return { id, entity_id: entityId, entity_type: 'habitat', tag_id: tagId };
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useRecordTags', () => {
	it('names and colours a tag through the join', async () => {
		seedRows(tags, [tag('t1', 'Roadside')]);
		seedRows(tag_items, [tagItem('i1', HABITAT, 't1')]);

		const { result } = await renderRead(() => useRecordTags(HABITAT));

		expect(result.current.map(plain)).toEqual([
			{ id: 't1', name: 'Roadside', color: '#336699', description: null },
		]);
	});

	it('reads them in name order rather than in the order they were tagged', async () => {
		seedRows(tags, [tag('t1', 'Zephyr'), tag('t2', 'Alder'), tag('t3', 'Meadow')]);
		seedRows(tag_items, [
			tagItem('i1', HABITAT, 't1'),
			tagItem('i2', HABITAT, 't2'),
			tagItem('i3', HABITAT, 't3'),
		]);

		const { result } = await renderRead(() => useRecordTags(HABITAT));

		expect(result.current.map((row) => row.name)).toEqual(['Alder', 'Meadow', 'Zephyr']);
	});

	it('drops an assignment whose catalog row it does not hold', async () => {
		// The `'inner'` third argument is what does this. Without it `.join()` in
		// `@tanstack/db` defaults to `left`, the unmatched row is emitted, and the
		// `coalesce` labels it "Unknown tag". The `coalesce` calls stay because the
		// builder types a joined column as possibly absent whatever the join kind,
		// so this is the assertion that says they are unreachable.
		seedRows(tags, [tag('t1', 'Roadside')]);
		seedRows(tag_items, [tagItem('i1', HABITAT, 't1'), tagItem('i2', HABITAT, 'not-synced')]);

		const { result } = await renderRead(() => useRecordTags(HABITAT));

		expect(result.current.map((row) => row.name)).toEqual(['Roadside']);
	});

	it('answers about the record it was asked about', async () => {
		seedRows(tags, [tag('t1', 'Roadside'), tag('t2', 'Alder')]);
		seedRows(tag_items, [tagItem('i1', HABITAT, 't1'), tagItem('i2', OTHER, 't2')]);

		const { result } = await renderRead(() => useRecordTags(HABITAT));

		expect(result.current.map((row) => row.name)).toEqual(['Roadside']);
	});

	it('is empty for a record nothing is tagged against', async () => {
		seedRows(tags, [tag('t1', 'Roadside')]);
		seedRows(tag_items, [tagItem('i1', OTHER, 't1')]);

		const { result } = await renderRead(() => useRecordTags(HABITAT));

		expect(result.current).toEqual([]);
	});
});
