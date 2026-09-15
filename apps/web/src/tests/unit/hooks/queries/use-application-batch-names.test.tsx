/** @vitest-environment jsdom */

/**
 * Control operations' read: the insecticide batches one application drew from.
 *
 * A link row whose batch has not streamed is left off the label rather than
 * reaching it as a blank, since `Batch A, , C` reads as a data problem rather
 * than as a pending one. That used to be an `inner` join and is a `left` join
 * with the unmatched rows dropped after it (#1028): both tables are on-demand,
 * and `inner` picked its lazy side by which collection held fewer rows in the
 * browser, so on a cold page the `insecticide_batches` subset went out with no
 * predicate and the Organization's whole batch table streamed to name two rows
 * on a card. The predicate strings are asserted whole, so the join running
 * backwards again fails on the string rather than on a page.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useApplicationBatchNames } from '../../../../hooks/queries/use-application-batch-names';
import { application_batches } from '../../../../lib/collections/application_batches';
import { insecticide_batches } from '../../../../lib/collections/insecticide_batches';
import {
	installMemoryCollections,
	seedRows,
	subsetPredicate,
	subsetRequests,
} from '../../lib/collections/memory-collections';
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

	it('asks the batches shape for the linked batch ids and nothing else', async () => {
		// Installed again with the on-demand tables in on-demand mode, which the
		// `beforeEach` install is not, so the batches seeded there are gone and are
		// seeded once more here.
		installMemoryCollections({ recordSubsets: true });
		seedRows(insecticide_batches, [
			{ id: 'b1', batch_name: 'Batch C', is_active: true },
			{ id: 'b2', batch_name: 'Batch A', is_active: true },
		]);
		seedRows(application_batches, [link('l1', 'b1'), link('l2', 'b2')]);

		await renderRead(() => useApplicationBatchNames(APPLICATION));

		const linkPredicates = subsetRequests(application_batches).map(subsetPredicate);
		const batchPredicates = subsetRequests(insecticide_batches).map(subsetPredicate);
		expect(linkPredicates).toEqual([`application_id = ${APPLICATION}`]);
		expect(batchPredicates).toEqual(['id = ANY [b1, b2]']);
	});
});
