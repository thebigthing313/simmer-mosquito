import { describe, expect, it } from 'vitest';
import {
	buildBreadcrumbs,
	firstDestination,
	navDestination,
	resolveActive,
} from '../../../../components/app-shell/resolve-nav';
import type { ShellDomain } from '../../../../components/app-shell/types';
import { iconRegistry } from '../../../../icons/registry';

/**
 * The half of the shell that turns a path into "where am I".
 *
 * What is pinned here is the record-bearing case. Every item was a literal
 * route until the Overview sidebar grew a row per Profile, and a row built at
 * render time can only be matched, navigated to, and named in a breadcrumb if
 * the template and the id are put back together the same way in all three
 * places.
 */

const ADA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';

function overview(): ShellDomain {
	return {
		id: 'overview',
		label: 'Overview',
		icon: iconRegistry.generic.component.icon,
		groups: [
			{
				id: 'overview-main',
				items: [{ id: 'dashboard', label: 'Dashboard', to: '/dashboard' }],
			},
			{
				id: 'overview-daily-work',
				label: 'Daily Work',
				items: [
					{
						id: `daily-work-${ADA}`,
						label: 'Ada Lovelace',
						to: '/daily-work/$profileId',
						params: { profileId: ADA },
					},
					{
						id: `daily-work-${BEN}`,
						label: 'Ben Okri',
						to: '/daily-work/$profileId',
						params: { profileId: BEN },
					},
				],
			},
		],
	};
}

describe('navDestination', () => {
	it('leaves a plain route alone', () => {
		expect(navDestination({ to: '/dashboard' })).toBe('/dashboard');
	});

	it('fills every $segment from params', () => {
		expect(navDestination({ to: '/daily-work/$profileId', params: { profileId: ADA } })).toBe(
			`/daily-work/${ADA}`,
		);
	});

	it('leaves a $segment nobody supplied in place', () => {
		// Visibly wrong beats quietly shorter: dropping it would produce
		// `/daily-work`, which is a path some other item could match.
		expect(navDestination({ to: '/daily-work/$profileId', params: {} })).toBe(
			'/daily-work/$profileId',
		);
	});

	it('has no destination without a route', () => {
		expect(navDestination({})).toBeNull();
	});
});

describe('resolveActive with record-bearing items', () => {
	it('lights the row whose id is in the path', () => {
		const { group, item } = resolveActive([overview()], `/daily-work/${BEN}`);

		expect(group?.label).toBe('Daily Work');
		expect(item?.id).toBe(`daily-work-${BEN}`);
	});

	it('lights no row for an id the navigation does not carry', () => {
		const stranger = '33333333-3333-4333-8333-333333333333';

		expect(resolveActive([overview()], `/daily-work/${stranger}`).item).toBeNull();
	});
});

describe('buildBreadcrumbs with record-bearing items', () => {
	it('ends the trail on the person rather than the id', () => {
		const crumbs = buildBreadcrumbs([overview()], `/daily-work/${ADA}`);

		expect(crumbs.map((crumb) => crumb.label)).toEqual(['Overview', 'Daily Work', 'Ada Lovelace']);
	});

	it('leaves no trailing id crumb behind the name', () => {
		// The item's own path covers the id segment, so there is nothing left to
		// render as `#11111111-...`.
		const crumbs = buildBreadcrumbs([overview()], `/daily-work/${ADA}`);

		expect(crumbs.some((crumb) => crumb.label.startsWith('#'))).toBe(false);
	});

	it('carries the params so the crumb links the record, not the template', () => {
		const [last] = buildBreadcrumbs([overview()], `/daily-work/${ADA}`).slice(-1);

		expect(navDestination(last ?? {})).toBe(`/daily-work/${ADA}`);
	});
});

describe('firstDestination', () => {
	it('resolves a record-bearing first item', () => {
		const domain: ShellDomain = {
			...overview(),
			groups: overview().groups.slice(1),
		};

		expect(firstDestination(domain)).toBe(`/daily-work/${ADA}`);
	});
});
