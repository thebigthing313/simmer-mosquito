// @vitest-environment jsdom

/**
 * The active domain's navigation scrolls inside the shared `ScrollArea`, so a
 * long set of groups draws the styled bar the explorer result rails draw
 * rather than the browser's own (#1254). The `<nav>` keeps the domain's name
 * and the scroll happens inside it.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SecondarySidebarContent } from '../../../../../components/app-shell/secondary-sidebar/secondary-sidebar-content';
import { ShellProvider } from '../../../../../components/app-shell/shell-context';
import type { ShellDomain } from '../../../../../components/app-shell/types';
import { iconRegistry } from '../../../../../icons/registry';

/** Radix's scrollbar measures its viewport, and jsdom ships no observer. */
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const ORGANIZATION = { id: 'org-1', name: 'Kern' };

const LARVAL: ShellDomain = {
	id: 'larval',
	label: 'Larval Surveillance',
	icon: iconRegistry.generic.component.icon,
	groups: [
		{
			id: 'larval-records',
			label: 'Records',
			items: [
				{ id: 'habitats', label: 'Habitats', to: '/habitats' },
				{ id: 'inspections', label: 'Inspections', to: '/inspections' },
			],
		},
	],
};

afterEach(cleanup);

describe('the secondary sidebar navigation', () => {
	it('keeps the domain landmark and scrolls inside a scroll-area slot within it', () => {
		render(
			<ShellProvider
				activePath="/habitats"
				currentOrganization={ORGANIZATION}
				domains={[LARVAL]}
				onNavigate={() => {}}
				onSelectOrganization={() => {}}
				organizations={[ORGANIZATION]}
				user={{ name: 'Ada', email: 'ada@example.test' }}
			>
				<SecondarySidebarContent />
			</ShellProvider>,
		);
		const nav = screen.getByRole('navigation', { name: 'Larval Surveillance' });
		const viewport = nav.querySelector('[data-slot="scroll-area-viewport"]');

		expect(nav.querySelector(':scope > [data-slot="scroll-area"]')).not.toBeNull();
		expect(viewport?.contains(screen.getByRole('button', { name: 'Habitats' }))).toBe(true);
		expect(nav.className.split(' ')).not.toContain('overflow-y-auto');
	});
});
