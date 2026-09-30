/** @vitest-environment jsdom */

/**
 * The counts in a worklist's tab strip (#1265).
 *
 * Stops has carried its count since the strip was drawn. Comments carries the
 * thread's the same way, read before the tab is opened, so a reader can tell
 * whether a thread is worth the click. Neither draws a zero. The collections
 * are the memory source, so the count is a real live query following rows as
 * a shape would stream them.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorklistTabs } from '../../../../components/operations/worklist-tabs';
import { comments } from '../../../../lib/collections/comments';
import {
	installMemoryCollections,
	removeRows,
	seedRows,
} from '../../lib/collections/memory-collections';

const MISSION = '11111111-1111-4111-8111-111111111111';

function comment(id: string, entityId = MISSION) {
	return {
		id,
		organization_id: 'org-1',
		entity_type: 'mission',
		entity_id: entityId,
		comment_text: 'Gate code is 4410.',
		commented_by_profile_id: null,
		commented_at: new Date('2026-09-01T12:00:00Z'),
		is_pinned: false,
		edited_at: null,
		edited_by_profile_id: null,
	};
}

beforeEach(() => {
	installMemoryCollections();
});

afterEach(cleanup);

function renderTabs(stopCount = 0): void {
	render(
		<WorklistTabs stopCount={stopCount} target={{ type: 'mission', id: MISSION }}>
			<p>stop list</p>
		</WorklistTabs>,
	);
}

function tabName(label: string): string {
	return screen.getByRole('tab', { name: new RegExp(`^${label}`) }).textContent ?? '';
}

describe('the worklist tab strip', () => {
	it('draws the comment count on the Comments tab while Stops is open', async () => {
		seedRows(comments, [comment('c1'), comment('c2'), comment('c3', 'another-mission')]);
		renderTabs(4);

		await waitFor(() => expect(tabName('Comments')).toBe('Comments2'));
		expect(tabName('Stops')).toBe('Stops4');
		expect(screen.getByText('stop list')).toBeTruthy();
	});

	it('draws no count on either tab at zero', async () => {
		renderTabs(0);

		await waitFor(() => expect(tabName('Comments')).toBe('Comments'));
		expect(tabName('Stops')).toBe('Stops');
	});

	it('moves the count when a comment is added and when one is deleted', async () => {
		seedRows(comments, [comment('c1')]);
		renderTabs();
		await waitFor(() => expect(tabName('Comments')).toBe('Comments1'));

		act(() => seedRows(comments, [comment('c2')]));
		await waitFor(() => expect(tabName('Comments')).toBe('Comments2'));

		act(() => removeRows(comments, [comment('c1'), comment('c2')]));
		await waitFor(() => expect(tabName('Comments')).toBe('Comments'));
	});
});
