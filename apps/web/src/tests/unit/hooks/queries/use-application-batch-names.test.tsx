/** @vitest-environment jsdom */

/**
 * Control operations' read: the insecticide batches one application drew from.
 *
 * The one join in this folder that names `inner` and passes it. That matters,
 * because `.join()` in `@tanstack/db` defaults to `left`: a link row whose batch
 * has not streamed would otherwise reach the label as a blank, and
 * `Batch A, , C` reads as a data problem rather than as a pending one.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useApplicationBatchNames } from '../../../../hooks/queries/use-application-batch-names';
import { application_batches } from '../../../../lib/collections/application_batches';
import { insecticide_batches } from '../../../../lib/collections/insecticide_batches';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const APPLICATION = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function link(id: string, batchId: string, applicationId = APPLICATION) {
	return { id, application_id: applicationId, insecticide_batch_id: batchId };
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(insecticide_batches, [
		{ id: 'b1', batch_name: 'Batch C', is_active: true },
		{ id: 'b2', batch_name: 'Batch A', is_active: true },
	]);
});

describe('useApplicationBatchNames', () => {
	it('reads the batch names in name order', async () => {
		seedRows(application_batches, [link('l1', 'b1'), link('l2', 'b2')]);

		const { result } = await renderRead(() => useApplicationBatchNames(APPLICATION));

		expect(result.current).toEqual(['Batch A', 'Batch C']);
	});

	it('drops a link whose batch has not arrived rather than showing a gap', async () => {
		seedRows(application_batches, [link('l1', 'b2'), link('l2', 'missing')]);

		const { result } = await renderRead(() => useApplicationBatchNames(APPLICATION));

		expect(result.current).toEqual(['Batch A']);
	});

	it('answers about the application it was asked about', async () => {
		seedRows(application_batches, [link('l1', 'b2'), link('l2', 'b1', OTHER)]);

		const { result } = await renderRead(() => useApplicationBatchNames(APPLICATION));

		expect(result.current).toEqual(['Batch A']);
	});

	it('matches nothing when the caller has no application yet', async () => {
		// A hook cannot be called conditionally, so a form that has not chosen one
		// asks for an id no row has. Reading the whole table instead would put
		// every batch in the organization behind an empty field.
		seedRows(application_batches, [link('l1', 'b1'), link('l2', 'b2')]);

		const { result } = await renderRead(() => useApplicationBatchNames(null));

		expect(result.current).toEqual([]);
	});
});
