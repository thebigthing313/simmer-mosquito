/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommandRunner } from '../../../../routes/operations/-command-runner';

/**
 * The one gate the worklist pages send their lifecycle writes through.
 *
 * A refusal is a toast and nothing on the page (#1100). The hook used to hold
 * the message in state for the page to draw in an `Alert`, and the three pages
 * that did so were the only record pages reporting a refused start, complete,
 * cancel or reopen anywhere but where `RecordDeleteDialog` and the header menu
 * report one. So what this asserts is the shape of the report: the server's
 * sentence when the thrown error carries one, the page's fallback when it does
 * not, and no `error` left on the hook for a page to draw.
 */

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('sonner', () => ({
	toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

beforeEach(() => {
	toastError.mockReset();
	toastSuccess.mockReset();
});

describe('useCommandRunner', () => {
	it('reports a refused write as a toast carrying the server sentence', async () => {
		const { result } = renderHook(() => useCommandRunner());

		await act(() =>
			result.current.run(
				() => Promise.reject(new Error('Some stops are still pending.')),
				'Unable to complete this mission.',
			),
		);

		expect(toastError).toHaveBeenCalledTimes(1);
		expect(toastError).toHaveBeenCalledWith('Some stops are still pending.');
		expect(result.current.busy).toBe(false);
	});

	it('falls back to the page sentence when the failure carries none', async () => {
		const { result } = renderHook(() => useCommandRunner());

		await act(() =>
			result.current.run(() => Promise.reject('refused'), 'Unable to complete this mission.'),
		);

		expect(toastError).toHaveBeenCalledWith('Unable to complete this mission.');
	});

	it('toasts nothing and holds nothing when the write goes through', async () => {
		const { result } = renderHook(() => useCommandRunner());

		await act(() => result.current.run(() => Promise.resolve(), 'Unable to start.'));

		expect(toastError).not.toHaveBeenCalled();
		expect(toastSuccess).not.toHaveBeenCalled();
		expect(result.current).not.toHaveProperty('error');
	});

	it('is busy while the write is in flight', async () => {
		const { result } = renderHook(() => useCommandRunner());
		let settle: () => void = () => {};
		const pending = new Promise<void>((resolve) => {
			settle = resolve;
		});

		let finished: Promise<void> = Promise.resolve();
		act(() => {
			finished = result.current.run(() => pending, 'Unable to start.');
		});
		expect(result.current.busy).toBe(true);

		await act(async () => {
			settle();
			await finished;
		});
		expect(result.current.busy).toBe(false);
	});
});
