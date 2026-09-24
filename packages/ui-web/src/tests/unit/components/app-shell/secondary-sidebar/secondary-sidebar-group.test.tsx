// @vitest-environment jsdom

/**
 * A collapsible group folds its rows behind its heading, opens by default, and
 * this browser remembers which way it was left. A group that does not ask to
 * collapse draws its heading as plain text, as every group did before.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecondarySidebarGroup } from '../../../../../components/app-shell/secondary-sidebar/secondary-sidebar-group';
import type { ShellNavGroup } from '../../../../../components/app-shell/types';

const DAILY_WORK: ShellNavGroup = {
	id: 'overview-daily-work',
	label: 'Daily Work',
	collapsible: true,
	items: [
		{ id: 'daily-work-a', label: 'Ada Ruiz', to: '/daily-work/$profileId' },
		{ id: 'daily-work-b', label: 'Ben Ito', to: '/daily-work/$profileId' },
	],
};

function renderGroup(group: ShellNavGroup) {
	return render(<SecondarySidebarGroup activeItemId={null} group={group} onSelect={() => {}} />);
}

afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('SecondarySidebarGroup', () => {
	it('opens a collapsible group and folds it away from its heading', () => {
		renderGroup(DAILY_WORK);
		const heading = screen.getByRole('button', { name: 'Daily Work' });

		expect(heading.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByRole('button', { name: 'Ada Ruiz' })).toBeTruthy();

		fireEvent.click(heading);

		expect(heading.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByRole('button', { name: 'Ada Ruiz' })).toBeNull();
	});

	it('opens folded when this browser left it folded', () => {
		renderGroup(DAILY_WORK);
		fireEvent.click(screen.getByRole('button', { name: 'Daily Work' }));
		cleanup();

		renderGroup(DAILY_WORK);

		expect(screen.getByRole('button', { name: 'Daily Work' }).getAttribute('aria-expanded')).toBe(
			'false',
		);
	});

	it('still folds when the store refuses, for as long as the page is open', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		renderGroup(DAILY_WORK);
		const heading = screen.getByRole('button', { name: 'Daily Work' });

		fireEvent.click(heading);

		expect(heading.getAttribute('aria-expanded')).toBe('false');
	});

	it('draws a group that does not collapse with a plain heading', () => {
		renderGroup({ ...DAILY_WORK, collapsible: false });

		expect(screen.queryByRole('button', { name: 'Daily Work' })).toBeNull();
		expect(screen.getByText('Daily Work')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Ada Ruiz' })).toBeTruthy();
	});
});
