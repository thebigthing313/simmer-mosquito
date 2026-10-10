/** @vitest-environment jsdom */

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.fn();
const setPersonnel = vi.fn((_input: unknown) => Promise.resolve());
const addComment = vi.fn((_target: unknown, _text: string) => Promise.resolve());

vi.mock('sonner', () => ({
	toast: { error: (title: string, options: unknown) => toastError(title, options) },
}));
vi.mock('../../../../hooks/mutations/use-additional-personnel-mutations', () => ({
	useAdditionalPersonnelMutations: () => ({ setPersonnel }),
}));
vi.mock('../../../../hooks/mutations/use-comment-mutations', () => ({
	useCommentMutations: () => ({ add: addComment }),
}));

const { useRecordExtras } = await import('../../../../hooks/forms/use-record-extras');

const TARGET = { type: 'inspection', id: 'a3000000-0000-4000-8000-000000000001' } as const;

/**
 * The six create forms attach their crew through this hook, onto a record with
 * no crew yet, so a miss there is still something to add from the record. The
 * edit wording #1566 added is for a change to links that already existed.
 */
describe('useRecordExtras', () => {
	beforeEach(() => {
		toastError.mockReset();
		setPersonnel.mockReset();
		addComment.mockReset();
		addComment.mockImplementation(() => Promise.resolve());
	});

	it('reports a failed crew attach with the create wording', async () => {
		setPersonnel.mockImplementation(() => Promise.reject(new Error('Refused.')));
		const { result } = renderHook(() => useRecordExtras());
		await result.current.attach({
			target: TARGET,
			profileIds: ['b0000000-0000-4000-8000-000000000002'],
			commentText: '',
		});
		expect(setPersonnel).toHaveBeenCalledWith({
			target: TARGET,
			existing: [],
			profileIds: ['b0000000-0000-4000-8000-000000000002'],
		});
		expect(toastError).toHaveBeenCalledWith(
			'Saved, but the additional personnel could not be attached.',
			{ description: 'Refused. Add them from the record.' },
		);
	});

	it('reports a failed note with the create wording', async () => {
		setPersonnel.mockImplementation(() => Promise.resolve());
		addComment.mockImplementation(() => Promise.reject(new Error('Refused.')));
		const { result } = renderHook(() => useRecordExtras());
		await result.current.attach({ target: TARGET, profileIds: [], commentText: 'Standing water.' });
		expect(toastError).toHaveBeenCalledWith('Saved, but the note could not be attached.', {
			description: 'Refused. Add them from the record.',
		});
	});
});
