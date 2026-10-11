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

const INSPECTION = { type: 'inspection', id: 'a3000000-0000-4000-8000-000000000001' } as const;
const COLLECTION = { type: 'collection', id: 'a4000000-0000-4000-8000-000000000001' } as const;

/**
 * The six create forms attach their crew and their note through this hook. The
 * detail page has no crew control, so a missed crew attach sends the person to
 * the edit form, and a missed note to the thread on the detail page (#1602).
 * Both name the target's own record type.
 */
describe('useRecordExtras', () => {
	beforeEach(() => {
		toastError.mockReset();
		setPersonnel.mockReset();
		addComment.mockReset();
		addComment.mockImplementation(() => Promise.resolve());
	});

	it('sends a failed crew attach to the edit form of the record it hangs off', async () => {
		setPersonnel.mockImplementation(() => Promise.reject(new Error('Refused.')));
		const { result } = renderHook(() => useRecordExtras());
		await result.current.attach({
			target: COLLECTION,
			profileIds: ['b0000000-0000-4000-8000-000000000002'],
			commentText: '',
		});
		expect(setPersonnel).toHaveBeenCalledWith({
			target: COLLECTION,
			existing: [],
			profileIds: ['b0000000-0000-4000-8000-000000000002'],
		});
		expect(toastError).toHaveBeenCalledWith(
			'Saved, but the additional personnel could not be attached.',
			{ description: 'Refused. Edit the collection to add them.' },
		);
	});

	it('sends a failed note to the thread on the record it hangs off', async () => {
		setPersonnel.mockImplementation(() => Promise.resolve());
		addComment.mockImplementation(() => Promise.reject(new Error('Refused.')));
		const { result } = renderHook(() => useRecordExtras());
		await result.current.attach({
			target: INSPECTION,
			profileIds: [],
			commentText: 'Standing water.',
		});
		expect(toastError).toHaveBeenCalledWith('Saved, but the note could not be attached.', {
			description: 'Refused. Add it as a comment on the inspection.',
		});
	});
});
