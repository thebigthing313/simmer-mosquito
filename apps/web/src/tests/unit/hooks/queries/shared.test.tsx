/** @vitest-environment jsdom */

/**
 * The single-record read: `useRecordById`.
 *
 * What it decides is the difference between a read that failed and a table that
 * holds no such row. A detail page draws "could not be found, or you do not have
 * access to it" for the second, which tells a reader to stop looking for a
 * record that exists, so the failed read has to arrive as an error and not as an
 * absence.
 *
 * The join and the projection are the caller's, and one case here goes through
 * them: the callback receives a query already filtered to the id, so anything it
 * builds on top has to survive that.
 */

import { caseWhen, eq, isNull } from '@tanstack/react-db';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRecordById } from '../../../../hooks/queries/shared';
import { region_folders } from '../../../../lib/collections/region_folders';
import { regions } from '../../../../lib/collections/regions';
import {
	installMemoryCollections,
	markFailed,
	seedRows,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const REGION = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FOLDER = '33333333-3333-4333-8333-333333333333';

function region(id: string, name: string, folderId: string | null = null) {
	return { id, name, description: null, region_folder_id: folderId };
}

/** A hook of the shape the six record hooks have, built on the factory. */
function useOneRegion(id: string | null) {
	return useRecordById({
		collection: regions(),
		id,
		query: (query) =>
			query
				.join(
					{ folder: region_folders() },
					({ record, folder }) => eq(record.region_folder_id, folder.id),
					'left',
				)
				.select(({ record, folder }) => ({
					id: record.id,
					name: record.name,
					folderName: caseWhen(isNull(record.region_folder_id), null, folder.name),
				})),
	});
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useRecordById', () => {
	it('reads the one row the id names, through the join the caller wrote', async () => {
		seedRows(region_folders, [{ id: FOLDER, name: 'North' }]);
		seedRows(regions, [region(REGION, 'Marsh', FOLDER), region(OTHER, 'Ditch')]);

		const { result } = await renderRead(() => useOneRegion(REGION));

		expect(result.current.record?.id).toBe(REGION);
		expect(result.current.record?.name).toBe('Marsh');
		expect(result.current.record?.folderName).toBe('North');
		expect(result.current.isReady).toBe(true);
		expect(result.current.isError).toBe(false);
	});

	it('reports a failed read as an error and not as a missing row', async () => {
		seedRows(regions, [region(REGION, 'Marsh')]);

		const { result } = await renderRead(() => useOneRegion(REGION));
		act(() => {
			markFailed(regions);
		});

		expect(result.current.isError).toBe(true);
	});

	it('reports an id no row has as ready, with no record and no error', async () => {
		seedRows(regions, [region(OTHER, 'Ditch')]);

		const { result } = await renderRead(() => useOneRegion(REGION));

		expect(result.current.record).toBeUndefined();
		expect(result.current.isReady).toBe(true);
		expect(result.current.isError).toBe(false);
	});

	it('matches nothing when it is asked about no id, rather than the whole table', async () => {
		seedRows(regions, [region(REGION, 'Marsh'), region(OTHER, 'Ditch')]);

		const { result } = await renderRead(() => useOneRegion(null));

		expect(result.current.record).toBeUndefined();
		expect(result.current.isReady).toBe(true);
	});
});
