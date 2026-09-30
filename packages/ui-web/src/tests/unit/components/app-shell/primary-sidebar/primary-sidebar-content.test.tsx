// @vitest-environment jsdom

/**
 * The domain list scrolls inside the shared `ScrollArea`, so a long list draws
 * the styled bar the explorer result rails draw rather than the browser's own
 * (#1254). The `<nav>` landmark stays outside the scroll area with its name,
 * and the active indicator sits in the same scrolled list as the buttons it
 * marks, so it moves with them when the list scrolls.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrimarySidebarContent } from '../../../../../components/app-shell/primary-sidebar/primary-sidebar-content';
import { PRIMARY_ITEM_PITCH } from '../../../../../components/app-shell/primary-sidebar/primary-sidebar-icon';
import { ShellProvider } from '../../../../../components/app-shell/shell-context';
import type { ShellDomain } from '../../../../../components/app-shell/types';
import { TooltipProvider } from '../../../../../components/ui/tooltip';
import { iconRegistry } from '../../../../../icons/registry';

const ORGANIZATION = { id: 'org-1', name: 'Kern' };

function domain(id: string, label: string): ShellDomain {
	return {
		id,
		label,
		icon: iconRegistry.generic.component.icon,
		groups: [{ id: `${id}-main`, items: [{ id: `${id}-home`, label, to: `/${id}` }] }],
	};
}

const DOMAINS = [
	domain('overview', 'Overview'),
	domain('larval', 'Larval Surveillance'),
	domain('adult', 'Adult Surveillance'),
];

function renderContent(collapsed: boolean) {
	return render(
		<TooltipProvider>
			<ShellProvider
				activePath="/adult"
				currentOrganization={ORGANIZATION}
				domains={DOMAINS}
				onNavigate={() => {}}
				onSelectOrganization={() => {}}
				organizations={[ORGANIZATION]}
				user={{ name: 'Ada', email: 'ada@example.test' }}
			>
				<PrimarySidebarContent collapsed={collapsed} />
			</ShellProvider>
		</TooltipProvider>,
	);
}

afterEach(cleanup);

describe.each([
	['expanded', false],
	['collapsed', true],
])('the primary sidebar domain list, %s', (_state, collapsed) => {
	it('keeps the Domains landmark and scrolls inside a scroll-area slot within it', () => {
		renderContent(collapsed);
		const nav = screen.getByRole('navigation', { name: 'Domains' });
		const viewport = nav.querySelector('[data-slot="scroll-area-viewport"]');

		expect(nav.querySelector(':scope > [data-slot="scroll-area"]')).not.toBeNull();
		expect(viewport?.contains(screen.getByRole('button', { name: 'Overview' }))).toBe(true);
		expect(nav.className.split(' ')).not.toContain('overflow-y-auto');
	});

	it('draws the active indicator in the scrolled list, offset to the active domain', () => {
		const { container } = renderContent(collapsed);
		const indicator = container.querySelector('span[aria-hidden="true"].absolute');
		const list = screen.getByRole('button', { name: 'Adult Surveillance' }).parentElement;

		expect(indicator?.parentElement).toBe(list);
		expect(list?.className.split(' ')).toContain('relative');
		expect((indicator as HTMLElement).style.transform).toBe(
			`translateY(${2 * PRIMARY_ITEM_PITCH}px)`,
		);
	});
});
