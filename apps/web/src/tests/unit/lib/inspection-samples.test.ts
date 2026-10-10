import { describe, expect, it, vi } from 'vitest';
import { addSamplesInFormOrder } from '../../../lib/inspection-samples';

/** A promise whose settling the test decides. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

describe('addSamplesInFormOrder', () => {
	it('starts each add only once the one before it has resolved', async () => {
		const first = deferred();
		const second = deferred();
		const pending = [first, second];
		const add = vi.fn(() => pending[add.mock.calls.length - 1]?.promise ?? Promise.resolve());

		const done = addSamplesInFormOrder(add, 'inspection-1', [
			{ id: 'sample-1', label: 'A1' },
			{ id: 'sample-2', label: 'A2' },
		]);

		await Promise.resolve();
		expect(add).toHaveBeenCalledTimes(1);
		expect(add).toHaveBeenLastCalledWith({
			sampleId: 'sample-1',
			inspectionId: 'inspection-1',
			displayName: 'A1',
		});

		first.resolve();
		await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(2));
		expect(add).toHaveBeenLastCalledWith({
			sampleId: 'sample-2',
			inspectionId: 'inspection-1',
			displayName: 'A2',
		});

		second.resolve();
		await done;
	});

	it('writes a blank label as an unlabeled sample', async () => {
		const add = vi.fn(() => Promise.resolve());

		await addSamplesInFormOrder(add, 'inspection-1', [{ id: 'sample-1', label: '  ' }]);

		expect(add).toHaveBeenCalledWith({
			sampleId: 'sample-1',
			inspectionId: 'inspection-1',
			displayName: null,
		});
	});
});
