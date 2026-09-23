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
