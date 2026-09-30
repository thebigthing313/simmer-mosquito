/**
 * The shell's `main` is the page scroller, and it draws the `scrollbar-subtle`
 * bar without giving up anything it already did (#1261).
 *
 * `main` cannot be wrapped in `ScrollArea`: it holds the ref route-change focus
 * lands on, it is the skip link's target, and it reserves its gutter so a page
 * keeps the width of its route-loading skeleton (#1053). So it stays a native
 * scroller and takes the utility, and these cases hold the four together on the
 * one element.
 *
 * Rendered to a string rather than into a DOM, the trade `card.test.tsx` makes.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OutletShell } from '../../../../../components/app-shell/outlet/outlet-shell';
import { ShellProvider } from '../../../../../components/app-shell/shell-context';
import type { ShellDomain } from '../../../../../components/app-shell/types';
import { iconRegistry } from '../../../../../icons/registry';

const ORGANIZATION = { id: 'org-1', name: 'Kern' };

/** The shell refuses an empty navigation, so it gets one destination. */
const OVERVIEW: ShellDomain = {
	id: 'overview',
	label: 'Overview',
	icon: iconRegistry.generic.component.icon,
	groups: [{ id: 'overview-main', items: [{ id: 'dashboard', label: 'Dashboard', to: '/' }] }],
};

function mainTag(): string {
	const markup = renderToStaticMarkup(
		<ShellProvider
			activePath="/"
			currentOrganization={ORGANIZATION}
			domains={[OVERVIEW]}
			getToday={() => new Date('2026-03-05T12:00:00Z')}
			onNavigate={() => {}}
			onSelectOrganization={() => {}}
			organizations={[ORGANIZATION]}
			timeZone="UTC"
			user={{ name: 'Ada', email: 'ada@example.test' }}
		>
			<OutletShell>
				<p>page</p>
			</OutletShell>
		</ShellProvider>,
	);
	const tag = markup.match(/<main[^>]*>/)?.[0];
	if (tag === undefined) {
		throw new Error('The shell rendered no `main`.');
	}
	return tag;
}

describe('the page scroller', () => {
	const tag = mainTag();
	const classes = tag.match(/class="([^"]*)"/)?.[1]?.split(' ') ?? [];

	it('scrolls natively and draws the subtle bar', () => {
		expect(classes).toContain('overflow-y-auto');
		expect(classes).toContain('scrollbar-subtle');
	});

	it('still reserves its gutter', () => {
		expect(classes).toContain('[scrollbar-gutter:stable]');
	});

	it('is still the skip link target and still takes programmatic focus', () => {
		expect(tag).toContain('id="main-content"');
		expect(tag).toContain('tabindex="-1"');
	});
});
