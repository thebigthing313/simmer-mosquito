/** @vitest-environment jsdom */

/**
 * useRegion over a Region whose folder the client does not hold.
 *
 * An unmatched `left` join yields `undefined`, and the folder name reads `null`
 * beside its id instead, so the page can tell a folder it cannot name from a
 * Region filed in none (#1535).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useRegion } from '../../../../hooks/queries/use-region';
import { regions } from '../../../../lib/collections/regions';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { readRecord } from './read-harness';

const GONE_FOLDER = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
	installMemoryCollections();
	seedRows(regions, [
		{
			id: 'r1',
			name: 'North zone',
			description: null,
			region_folder_id: GONE_FOLDER,
			lat: 38.5,
			lng: -121.7,
			geom_type: 'ST_MultiPolygon',
		},
	]);
});

describe('useRegion', () => {
	it('reads the folder name as null when the folder is not in the client', async () => {
		const region = await readRecord(() => {
			const read = useRegion('r1');
			return { isReady: read.isReady, record: read.region };
		});

		expect(region).toMatchObject({ folderId: GONE_FOLDER, folderName: null });
	});
});
