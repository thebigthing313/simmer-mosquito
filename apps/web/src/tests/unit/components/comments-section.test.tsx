/** @vitest-environment jsdom */

/**
 * What the comment thread offers on each comment, and the edited marker (#1251).
 *
 * `commentControls` is asserted role by role in `write-access.test.ts`. This
 * asserts the thread reads it: that a Manager's controls reach another
 * Profile's comment and a Collector's do not, and that the marker names the
 * corrector only when the corrector is not the author.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordComment } from '../../../hooks/queries/use-comments';
import { signedInSnapshotAs } from '../routes/route-mock-stand-ins';

const ME = 'profile-1';
const SOMEONE_ELSE = 'profile-2';

let role: SimmerRole = 'manager';
let thread: RecordComment[] = [];

vi.mock('../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => signedInSnapshotAs(role, 'org-1', ME),
}));
vi.mock('../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));
vi.mock('../../../hooks/queries/use-comments', () => ({
	useComments: () => ({ comments: thread, isReady: true, isError: false }),
}));
vi.mock('../../../hooks/mutations/use-comment-mutations', () => ({
	useCommentMutations: () => ({
		add: vi.fn(),
		edit: vi.fn(),
		setPinned: vi.fn(),
		remove: vi.fn(),
		canWrite: true,
	}),
}));

const { CommentsSection } = await import('../../../components/comments-section');

afterEach(() => {
	cleanup();
	role = 'manager';
	thread = [];
});

function comment(overrides: Partial<RecordComment>): RecordComment {
	return {
		id: crypto.randomUUID(),
		commentText: 'Standing water at the north end.',
		commentedByProfileId: SOMEONE_ELSE,
		authorName: 'Sam Rivera',
		commentedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
		isPinned: false,
		editedAt: null,
		editedByProfileId: null,
		editorName: null,
		...overrides,
	};
}

function renderThread(): void {
	render(<CommentsSection target={{ type: 'habitat', id: 'habitat-1' }} />);
}

/** The one comment's row, found by its text. */
function rowFor(text: string): HTMLElement {
	const paragraph = screen.getByText(text);
	const row = paragraph.closest('.group\\/comment');
	if (!(row instanceof HTMLElement)) {
		throw new Error(`No comment row holds "${text}".`);
	}
	return row;
}

describe('the controls on a comment', () => {
	it("gives a Manager pin, edit and delete on another Profile's comment", () => {
		role = 'manager';
		thread = [comment({ commentText: 'Theirs.' })];
		renderThread();

		const row = within(rowFor('Theirs.'));
		expect(row.getByRole('button', { name: 'Pin comment' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Edit comment' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Delete comment' })).toBeTruthy();
	});

	it('gives a Collector edit and delete on their own comment, and no pin anywhere', () => {
		role = 'collector';
		thread = [
			comment({ commentText: 'Mine.', commentedByProfileId: ME }),
			comment({ commentText: 'Theirs.' }),
		];
		renderThread();

		const mine = within(rowFor('Mine.'));
		expect(mine.getByRole('button', { name: 'Edit comment' })).toBeTruthy();
		expect(mine.getByRole('button', { name: 'Delete comment' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Pin comment' })).toBeNull();
		const theirs = within(rowFor('Theirs.'));
		expect(theirs.queryByRole('button', { name: 'Edit comment' })).toBeNull();
		expect(theirs.queryByRole('button', { name: 'Delete comment' })).toBeNull();
	});

	it("takes a Collector's controls off their own comment once the window closes", () => {
		role = 'collector';
		thread = [
			comment({
				commentText: 'Old.',
				commentedByProfileId: ME,
				commentedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
			}),
		];
		renderThread();

		const row = within(rowFor('Old.'));
		expect(row.queryByRole('button', { name: 'Edit comment' })).toBeNull();
		expect(row.queryByRole('button', { name: 'Delete comment' })).toBeNull();
	});

	it('gives a Viewer no controls', () => {
		role = 'viewer';
		thread = [comment({ commentText: 'Mine.', commentedByProfileId: ME })];
		renderThread();

		expect(screen.queryAllByRole('button')).toEqual([]);
	});
});

describe('the edited marker', () => {
	it('reads "Edited" when the author corrected their own comment', () => {
		thread = [
			comment({
				commentText: 'Corrected by its author.',
				editedAt: new Date(),
				editedByProfileId: SOMEONE_ELSE,
				editorName: 'Sam Rivera',
			}),
		];
		renderThread();

		const row = within(rowFor('Corrected by its author.'));
		expect(row.getByText('Edited')).toBeTruthy();
		expect(row.queryByText(/Edited by/)).toBeNull();
	});

	it('names the corrector when it was somebody else, with the full time behind it', () => {
		thread = [
			comment({
				commentText: 'Corrected by a Manager.',
				editedAt: new Date('2026-09-28T14:05:00.000Z'),
				editedByProfileId: ME,
				editorName: 'Jordan Lee',
			}),
		];
		renderThread();

		const marker = within(rowFor('Corrected by a Manager.')).getByText('Edited by Jordan Lee');
		expect(marker.getAttribute('title')).toBe('Sep 28, 2026, 10:05 AM');
	});

	it('marks no comment nobody corrected, pinned or not', () => {
		thread = [
			comment({ commentText: 'Pinned.', isPinned: true }),
			comment({ commentText: 'Plain.' }),
		];
		renderThread();

		expect(screen.queryByText(/^Edited/)).toBeNull();
	});
});

describe('the thread', () => {
	it('scrolls inside the styled viewport, with the composer above it staying put', () => {
		thread = [
			comment({ commentText: 'Pinned.', isPinned: true }),
			comment({ commentText: 'Plain.' }),
		];
		renderThread();

		const viewport = rowFor('Plain.').closest('[data-slot="scroll-area-viewport"]');
		expect(viewport).not.toBeNull();
		expect(rowFor('Pinned.').closest('[data-slot="scroll-area-viewport"]')).toBe(viewport);
		// The root and the viewport shrink as flex items, so a card held to a
		// height hands the viewport what the composer leaves.
		expect(viewport?.parentElement?.getAttribute('class')?.split(/\s+/)).toEqual(
			expect.arrayContaining(['min-h-0', 'flex-1', '[&>[data-slot=scroll-area-viewport]]:min-h-0']),
		);
		expect(screen.getByRole('textbox').closest('[data-slot="scroll-area-viewport"]')).toBeNull();
	});
});

describe('the count in the heading (#1265)', () => {
	/** The heading's text: the title, then the count when there is one. */
	function heading(): string {
		return document.querySelector('[data-slot="card-title"]')?.textContent ?? '';
	}

	it('draws how many comments the record has beside the heading', () => {
		thread = [
			comment({ commentText: 'Pinned.', isPinned: true }),
			comment({ commentText: 'First.' }),
			comment({ commentText: 'Second.' }),
		];
		renderThread();

		expect(heading()).toBe('Comments3');
	});

	it('draws no count on a record nobody has commented on', () => {
		renderThread();

		expect(heading()).toBe('Comments');
	});

	it('moves when a comment is added and when one is deleted', () => {
		const first = comment({ commentText: 'First.' });
		thread = [first];
		const { rerender } = render(<CommentsSection target={{ type: 'habitat', id: 'habitat-1' }} />);
		expect(heading()).toBe('Comments1');

		thread = [comment({ commentText: 'Second.' }), first];
		rerender(<CommentsSection target={{ type: 'habitat', id: 'habitat-1' }} />);
		expect(heading()).toBe('Comments2');

		thread = [];
		rerender(<CommentsSection target={{ type: 'habitat', id: 'habitat-1' }} />);
		expect(heading()).toBe('Comments');
	});
});
