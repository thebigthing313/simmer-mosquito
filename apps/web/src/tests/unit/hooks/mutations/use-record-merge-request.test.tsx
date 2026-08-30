/** @vitest-environment jsdom */

/**
 * That a merge is actually sent.
 *
 * Worth its own file because the first version of this hook did not send one,
 * and nothing about it looked wrong. It applied the merge optimistically through
 * `commandTransaction`, deleting each retired row from `addresses`, `habitats`
 * or `contacts`. All three are on-demand, and the cleanup page reads its
 * proposals over `/records/{type}/duplicates` without holding a live query over
 * any of them, so the rows were not in local state.
 *
 * Both ways that fails are quiet. `collection.delete` throws
 * `DeleteKeyNotFoundError` for a key it does not hold, and `transaction.mutate`
 * runs the callback synchronously, so the throw escaped before the request went
 * out and surfaced as a library message in the dialog. Skipping absent rows
 * instead is worse: `Transaction.commit` returns early when it has no mutations
 * and never calls its `mutationFn`, so the merge would have resolved as a
 * success having sent nothing.
 *
 * So this asserts the request, not the optimism. `recordMergeRequest` is tested
 * separately for what the request says; this is the seam that puts it on the
 * wire.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const writeCommand = vi.fn();
vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	writeCommand: (...args: readonly unknown[]) => writeCommand(...args),
}));

vi.mock('../../../../auth', () => ({ getServerUrl: () => 'https://api.test' }));

const { useRecordMerge } = await import('../../../../hooks/mutations/use-record-merge');

const SURVIVOR = '11111111-1111-4111-8111-111111111111';
const RETIRED = '22222222-2222-4222-8222-222222222222';

describe('useRecordMerge', () => {
	it('sends the merge to the command path of the record that survives', async () => {
		writeCommand.mockResolvedValue(1);
		const { result } = renderHook(() => useRecordMerge('address'));

		await result.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: true });

		expect(writeCommand).toHaveBeenCalledTimes(1);
		const [url, method, body] = writeCommand.mock.calls[0] as [string, string, unknown];
		expect(url).toBe(`https://api.test/commands/addresses/${SURVIVOR}`);
		expect(method).toBe('PATCH');
		expect(body).toEqual({
			sourceAddressIds: [RETIRED],
			acknowledgedMergeConsolidatesHistory: true,
			intents: ['foundation.mergeAddresses'],
		});
	});

	it('names the command in the body, because the server no longer infers one', async () => {
		writeCommand.mockResolvedValue(1);
		const { result } = renderHook(() => useRecordMerge('habitat'));

		await result.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: false });

		const [url, , body] = writeCommand.mock.calls.at(-1) as [
			string,
			string,
			Record<string, unknown>,
		];
		expect(url).toBe(`https://api.test/commands/habitats/${SURVIVOR}`);
		expect(body.intents).toEqual(['larvalSurveillance.mergeHabitats']);
		// Still false rather than absent: the server reads an absent flag as agreed.
		expect(body.acknowledgedMergeConsolidatesHistory).toBe(false);
	});

	it('lets a refusal reach the caller rather than resolving', async () => {
		// The dialog decides what to say about `merge_refused`, and it only gets the
		// chance if the rejection is not swallowed here.
		writeCommand.mockRejectedValue(new Error('Refused.'));
		const { result } = renderHook(() => useRecordMerge('contact'));

		await expect(
			result.current({ targetId: SURVIVOR, sourceIds: [RETIRED], acknowledged: true }),
		).rejects.toThrow('Refused.');
	});
});
