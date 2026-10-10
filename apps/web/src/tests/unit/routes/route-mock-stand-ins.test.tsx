/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { routerStandIn } from './route-mock-stand-ins';

afterEach(cleanup);

/**
 * The stand-in's `Link` is an anchor whose `href` is the `to` template with
 * the params written in, so a route suite can pin which id a link carries
 * without importing the route tree (#1147). Whether the route resolves is
 * `link-destinations.test.tsx`'s question, and `search` is not serialised
 * here, so a case reading either goes there.
 */
describe('routerStandIn', () => {
	const { Link } = routerStandIn({}, () => ({}));

	it('writes each param into its segment of the template', () => {
		render(
			<Link
				to="/public-engagement/contacts/$contactId/registrations/$id"
				params={{ contactId: 'c1', id: 'r2' }}
			>
				Rosa Delgado
			</Link>,
		);
		expect(screen.getByRole('link', { name: 'Rosa Delgado' }).getAttribute('href')).toBe(
			'/public-engagement/contacts/c1/registrations/r2',
		);
	});

	it('leaves a segment as written when params does not name it', () => {
		render(
			<Link to="/larval-surveillance/habitats/$id" params={{ habitatId: 'h1' }}>
				Habitat
			</Link>,
		);
		expect(screen.getByRole('link', { name: 'Habitat' }).getAttribute('href')).toBe(
			'/larval-surveillance/habitats/$id',
		);
	});

	it('renders a static path as its own href', () => {
		render(<Link to="/operations/missions">Missions</Link>);
		expect(screen.getByRole('link', { name: 'Missions' }).getAttribute('href')).toBe(
			'/operations/missions',
		);
	});

	it('does not write search into the href', () => {
		render(
			<Link to="/gis/regions" search={{ page: 2 }}>
				Regions
			</Link>,
		);
		const link = screen.getByRole('link', { name: 'Regions' });
		expect(link.getAttribute('href')).toBe('/gis/regions');
		expect(link.getAttribute('search')).toBeNull();
	});
});

/**
 * The navigation the stand-in hands out. With no `setSearch` it goes nowhere,
 * which is what most route suites rely on. With one, it computes the next
 * search the way the router would, hands it to `setSearch` and tells every
 * mounted `useSearch`, so a suite whose page is controlled by the URL reads its
 * own write back (#1482).
 */
describe('routerStandIn navigation', () => {
	function standInOver(initial: Record<string, unknown>, writes = true) {
		const store = { search: initial };
		const standIn = routerStandIn(
			{},
			() => store.search,
			undefined,
			writes
				? {
						setSearch: (next) => {
							store.search = next;
						},
					}
				: undefined,
		);
		return { store, standIn };
	}

	it('applies an updater function to the current search', async () => {
		const { store, standIn } = standInOver({ tab: 'details', page: 2 });
		await standIn.useNavigate()({ search: (previous) => ({ ...previous, tab: 'comments' }) });
		expect(store.search).toEqual({ tab: 'comments', page: 2 });
	});

	it('replaces the search with an object', async () => {
		const { store, standIn } = standInOver({ tab: 'details', page: 2 });
		await standIn.useNavigate()({ search: { tab: 'nearby' } });
		expect(store.search).toEqual({ tab: 'nearby' });
	});

	it('keeps the current search when none is passed', async () => {
		const { store, standIn } = standInOver({ tab: 'details' });
		await standIn.useNavigate()({ to: '/operations/missions' });
		expect(store.search).toEqual({ tab: 'details' });
	});

	it('re-renders a mounted useSearch with the new value', async () => {
		const { standIn } = standInOver({ tab: 'details' });
		function Tab() {
			return <p>{String(standIn.useSearch().tab)}</p>;
		}
		render(<Tab />);
		expect(screen.getByText('details')).toBeTruthy();

		await standIn.useNavigate()({ search: () => ({ tab: 'comments' }) });

		expect(screen.getByText('comments')).toBeTruthy();
	});

	it('changes nothing without setSearch', async () => {
		const { store, standIn } = standInOver({ tab: 'details' }, false);
		const initial = store.search;
		function Tab() {
			return <p>{String(standIn.useSearch().tab)}</p>;
		}
		render(<Tab />);

		const result = await standIn.useNavigate()({ search: () => ({ tab: 'comments' }) });

		expect(result).toBeUndefined();
		expect(store.search).toBe(initial);
		expect(screen.getByText('details')).toBeTruthy();
	});
});
