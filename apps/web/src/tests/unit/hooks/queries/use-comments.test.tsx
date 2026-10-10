/** @vitest-environment jsdom */

/**
 * useComments over a comment whose author and editor Profiles the client does
 * not hold.
 *
 * The Profile shape streams live rows only, so a comment by somebody whose
 * Profile was deleted reads that way for good. Each name reads `null` beside
 * its id rather than a stand-in label, and the thread draws its own words for
 * it (#1535).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useComments } from '../../../../hooks/queries/use-comments';
import { comments } from '../../../../lib/collections/comments';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { GONE_PROFILE, readList } from './unresolved-performed-actions';

const EDITOR = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
	installMemoryCollections();
	seedRows(comments, [
		{
			id: 'k1',
			entity_type: 'habitat',
			entity_id: 'h1',
			comment_text: 'Standing water after the storm.',
			commented_by_profile_id: GONE_PROFILE,
			commented_at: new Date('2026-08-04T12:00:00Z'),
			is_pinned: false,
			edited_at: new Date('2026-08-05T12:00:00Z'),
			edited_by_profile_id: EDITOR,
		},
	]);
});

describe('useComments', () => {
	it('reads the author and editor names as null when neither Profile is in the client', async () => {
		const rows = await readList(() => {
			const read = useComments({ type: 'habitat', id: 'h1' });
			return { isReady: read.isReady, rows: read.comments };
		});

		expect(rows[0]).toMatchObject({
			commentedByProfileId: GONE_PROFILE,
			authorName: null,
			editedByProfileId: EDITOR,
			editorName: null,
		});
	});
});
