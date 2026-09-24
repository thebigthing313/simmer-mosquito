/**
 * The header's date line reads the same on every machine.
 *
 * It formatted through `Intl.DateTimeFormat(undefined, ...)`, so the wording
 * was whatever locale the browser happened to run in, which is the drift #683
 * swept out of `apps/web/src` and #1116 widened to the modules that draw for
 * it. The date is asserted as the `en-US` string, because under `en-GB` the
 * same options render `Wed 4 Mar 2026`, and the case runs the line through
 * the organization's zone so the day named is the operational one.
 *
 * Rendered to a string rather than into a DOM, the trade `card.test.tsx` makes.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppHeader } from '../../../../../components/app-shell/header/app-header';
import { ShellProvider } from '../../../../../components/app-shell/shell-context';
import type { ShellDomain } from '../../../../../components/app-shell/types';
import { iconRegistry } from '../../../../../icons/registry';

const ORGANIZATION = { id: 'org-1', name: 'Kern' };

/** The shell refuses an empty navigation, so the trail gets one destination. */
const OVERVIEW: ShellDomain = {
	id: 'overview',
	label: 'Overview',
	icon: iconRegistry.generic.component.icon,
	groups: [{ id: 'overview-main', items: [{ id: 'dashboard', label: 'Dashboard', to: '/' }] }],
};

function renderHeader(
	getToday: () => Date,
	timeZone: string,
	onOpenNavigation?: () => void,
): string {
	return renderToStaticMarkup(
		<ShellProvider
			activePath="/"
			currentOrganization={ORGANIZATION}
			domains={[OVERVIEW]}
			getToday={getToday}
			onNavigate={() => {}}
			onSelectOrganization={() => {}}
			organizations={[ORGANIZATION]}
			timeZone={timeZone}
			user={{ name: 'Ada', email: 'ada@example.test' }}
		>
			<AppHeader onOpenNavigation={onOpenNavigation} />
		</ShellProvider>,
	);
}

describe('the header date line', () => {
	it('names the organization day in en-US wording whatever the machine locale', () => {
		// 04:30 UTC on 5 March is still the evening of 4 March in Los Angeles.
		const markup = renderHeader(() => new Date('2026-03-05T04:30:00Z'), 'America/Los_Angeles');

		expect(markup).toContain('>Wed, Mar 4, 2026<');
	});
});

/**
 * Under `lg` the rails live in a drawer and this button is the only way to it,
 * so it is drawn whenever the shell hands the header an opener, hidden from
 * `lg` up by class rather than by a width the server cannot know.
 */
describe('the navigation drawer button', () => {
	const today = () => new Date('2026-03-05T12:00:00Z');

	it('is drawn with a name when the shell hands the header an opener', () => {
		const button = renderHeader(today, 'UTC', () => {})
			.match(/<button[^>]*>/g)
			?.find((tag) => tag.includes('aria-label="Open navigation"'));

		expect(button?.match(/class="([^"]*)"/)?.[1]?.split(' ')).toContain('lg:hidden');
	});

	it('is absent when nothing can open a drawer', () => {
		expect(renderHeader(today, 'UTC')).not.toContain('Open navigation');
	});
});
