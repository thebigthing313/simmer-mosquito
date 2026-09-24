/** @vitest-environment jsdom */
import {
	BreadcrumbLabelProvider,
	useBreadcrumbLabels,
} from '@simmer-mosquito/ui-web/components/app-shell';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordUnavailable } from '../../../../components/record/record-unavailable';

const ID = '00000000-0000-0000-0000-000000000000';
const route = vi.hoisted(() => ({ params: {} as Record<string, string>, pathname: '/' }));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	useParams: ({ select }: { select: (params: unknown) => unknown }) => select(route.params),
	useLocation: ({ select }: { select: (location: unknown) => unknown }) =>
		select({ pathname: route.pathname }),
	Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

function Labels() {
	const labels = useBreadcrumbLabels();
	return <output>{labels.get(ID) ?? ''}</output>;
}

/**
 * The two things this component exists to settle, and which twenty-odd
 * hand-written copies had each settled for themselves.
 */
describe('RecordUnavailable', () => {
	afterEach(() => {
		cleanup();
		route.params = {};
		route.pathname = '/';
	});

	// It was a dead end: no way back, and a breadcrumb ending in the raw id.
	it('links back to the list the record sits under and names it in the trail', () => {
		route.params = { id: ID };
		route.pathname = `/larval-surveillance/habitats/${ID}/edit`;
		render(
			<BreadcrumbLabelProvider>
				<RecordUnavailable recordType="habitat" reason="not-found" />
				<Labels />
			</BreadcrumbLabelProvider>,
		);

		const link = screen.getByRole('link', { name: 'Back to Habitats' });
		expect(link.getAttribute('href')).toBe('/larval-surveillance/habitats');
		expect(screen.getByRole('status').textContent).toBe('Unknown habitat');
	});

	it('names only the record type in the trail when the read failed', () => {
		route.params = { id: ID };
		route.pathname = `/gis/regions/${ID}`;
		render(
			<BreadcrumbLabelProvider>
				<RecordUnavailable recordType="region" reason="error" />
				<Labels />
			</BreadcrumbLabelProvider>,
		);

		expect(screen.getByRole('status').textContent).toBe('Region');
	});

	it('draws no back link on a route with no record id', () => {
		render(<RecordUnavailable recordType="trap" reason="not-found" />);

		expect(screen.queryByRole('link')).toBeNull();
	});

	// About half the copies hard-coded one message for both cases, so a
	// transient sync failure and a permissions refusal read identically — and
	// the reader has no way to tell "wait" from "stop looking".
	it('tells a load failure apart from a record that is not there', () => {
		const { rerender } = render(<RecordUnavailable recordType="collection" reason="error" />);
		expect(
			screen.getByText('This collection could not be loaded. Try again shortly.'),
		).toBeTruthy();

		rerender(<RecordUnavailable recordType="collection" reason="not-found" />);
		expect(
			screen.getByText('This collection could not be found, or you do not have access to it.'),
		).toBeTruthy();
	});

	it('titles itself from the register, in the words the record is called', () => {
		render(<RecordUnavailable recordType="serviceRequest" reason="not-found" />);

		expect(screen.getByText('Service Request Unavailable')).toBeTruthy();
	});

	it('lets a page say something more specific than either default', () => {
		render(
			<RecordUnavailable
				description="This application's personnel and batches could not be loaded."
				recordType="application"
				reason="error"
			/>,
		);

		expect(
			screen.getByText("This application's personnel and batches could not be loaded."),
		).toBeTruthy();
		expect(screen.queryByText(/Try again shortly/)).toBeNull();
	});

	// The other inconsistency: the same state was vertically centred on some
	// routes and top-aligned on others, with nothing deciding which. It now
	// follows from the kind of route — an edit pane has no chrome to sit under.
	it('centres itself only where the route has no chrome of its own', () => {
		// The centring wrapper is the full-height pane; `Empty` does its own
		// internal centring either way, so the selector has to be the outer div.
		const { container, rerender } = render(
			<RecordUnavailable recordType="trap" reason="not-found" />,
		);
		expect(container.querySelector('div.h-full.min-h-0')).toBeNull();

		rerender(<RecordUnavailable layout="centered" recordType="trap" reason="not-found" />);
		expect(container.querySelector('div.h-full.min-h-0')).not.toBeNull();
	});
});
