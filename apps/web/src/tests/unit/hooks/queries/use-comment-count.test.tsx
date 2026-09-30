/** @vitest-environment jsdom */

/**
 * How many comments a record has, for a label drawn before its thread is open
 * (#1265).
 *
 * The count is the thread's own read, so what it counts is whatever the thread
 * lists: the one record's comments, attributed or not. The live cases seed and
 * remove rows the way a shape streams them, which is how an add or a delete
 * arrives once the server has it.
 */

import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCommentCount } from '../../../../hooks/queries/use-comment-count';
import { comments } from '../../../../lib/collections/comments';
import { profiles } from '../../../../lib/collections/profiles';
import {
	installMemoryCollections,
	removeRows,
	seedRows,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const HABITAT = '11111111-1111-4111-8111-111111111111';
const OTHER_HABITAT = '22222222-2222-4222-8222-222222222222';

function comment(id: string, entityId: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: 'org-1',
		entity_type: 'habitat',
		entity_id: entityId,
		comment_text: 'Standing water at the north end.',
		commented_by_profile_id: 'profile-1',
		commented_at: new Date('2026-09-01T12:00:00Z'),
		is_pinned: false,
		edited_at: null,
		edited_by_profile_id: null,
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(profiles, [{ id: 'profile-1', display_name: 'Sam Rivera' }]);
});

describe('useCommentCount', () => {
	it("counts the record's comments and no other record's", async () => {
		seedRows(comments, [
			comment('c1', HABITAT),
			comment('c2', HABITAT, { commented_by_profile_id: null }),
			comment('c3', OTHER_HABITAT),
			comment('c4', HABITAT, { entity_type: 'trap' }),
		]);

		const { result } = await renderRead(() => useCommentCount({ type: 'habitat', id: HABITAT }));

		await waitFor(() => expect(result.current).toBe(2));
	});

	it('is zero for a record nobody has commented on', async () => {
		seedRows(comments, [comment('c1', OTHER_HABITAT)]);

		const { result } = await renderRead(() => useCommentCount({ type: 'habitat', id: HABITAT }));

		expect(result.current).toBe(0);
	});

	it('follows a comment arriving and a comment leaving', async () => {
		seedRows(comments, [comment('c1', HABITAT)]);
		const { result } = await renderRead(() => useCommentCount({ type: 'habitat', id: HABITAT }));
		await waitFor(() => expect(result.current).toBe(1));

		act(() => seedRows(comments, [comment('c2', HABITAT)]));
		await waitFor(() => expect(result.current).toBe(2));

		act(() => removeRows(comments, [comment('c1', HABITAT)]));
		await waitFor(() => expect(result.current).toBe(1));
	});
});
