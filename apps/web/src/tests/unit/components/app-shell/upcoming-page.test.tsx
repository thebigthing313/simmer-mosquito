/** @vitest-environment jsdom */
import { ShellProvider } from '@simmer-mosquito/ui-web/components/app-shell';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shellDomainsForRole } from '../../../../components/app-shell/navigation';
import { UpcomingPage } from '../../../../components/app-shell/upcoming-page';
import { signedInSnapshotAs } from '../../routes/route-mock-stand-ins';
import { stubItems } from './stub-items';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ to, children, ...rest }: { readonly to: string; readonly children?: ReactNode }) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

/** The opening words of the copy shown when a path has no entry of its own. */
const FALLBACK = 'The shell, navigation, and routing are wired.';

afterEach(cleanup);

/**
 * The page a wired-but-unbuilt section renders.
 *
 * Its copy is keyed by route path, and a key that does not match its route is
 * not an error: the page falls back to a generic line under whatever the
 * sidebar calls the item, and looks finished. So the copy tests here are about
 * the key matching, one for the Data Map, one for the two Overview stubs and
 * one for every stub at once, and the link test is the register's own rule
 * read back off the page.
 */
describe('UpcomingPage', () => {
	it('names what the Data Map will do and where to work meanwhile', () => {
		renderAt('/gis/data-explorer');

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Data Map');
		expect(screen.getByText(/choose which records draw/i)).toBeTruthy();
		expect(hrefs()).toEqual([
			'/gis/regions',
			'/larval-surveillance/habitats',
			'/adult-surveillance/traps',
		]);
	});

	it('gives every sidebar stub copy of its own', () => {
		// The failure this catches is silent: a key that does not match the route's
		// path still renders, as the generic "will land here" line under whatever
		// the sidebar calls the item. The page looks finished and says nothing.
		const paths = stubPaths();
		expect(paths.length).toBeGreaterThan(0);

		for (const path of paths) {
			const { container } = renderAt(path);
			expect(container.textContent).not.toContain(FALLBACK);
			expect(screen.getByText('What will land here')).toBeTruthy();
			cleanup();
		}
	});

	it('names what Annual will hold and where to work meanwhile', () => {
		renderAt('/annual');
		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Annual');
		expect(screen.getByText(/the material an annual report is written from/i)).toBeTruthy();
		expect(willLandLines()).toHaveLength(3);
		expect(hrefs()).toEqual(['/control-operations', '/gis/regions', '/gis/weather']);
	});

	it('links every stub to built routes only', () => {
		// Linking one unbuilt section to another is how a placeholder becomes a
		// maze, and every `/stats` route is a stub too. The rule is written in the
		// docblock over `CONTENT`; this is the rule read back off the rendered page.
		const stubs = new Set(stubPaths());

		for (const path of stubs) {
			renderAt(path);
			for (const href of hrefs()) {
				expect(stubs.has(href), `${path} links ${href}`).toBe(false);
				expect(href.endsWith('/stats'), `${path} links ${href}`).toBe(false);
			}
			cleanup();
		}
	});

	// One prop here is the measure of every stub. The route-loading skeleton
	// reserves the record measure and draws its heading at the frame's left
	// edge, so a stub centred in the 1200 column arrived narrower than the
	// skeleton with its heading 440px to the right of where the skeleton's sat
	// (#1043, #1048). The prose keeps a measure of its own inside the frame.
	it('draws in the record measure the route-loading skeleton reserves', () => {
		const { container } = renderAt('/gis/data-explorer');
		const measure = pageContainer({ measure: 'record' })
			.split(/\s+/)
			.find((cls) => cls.startsWith('max-w-'));
		if (measure === undefined) {
			throw new Error('pageContainer names no record measure');
		}

		expect(container.querySelector(`.${CSS.escape(measure)}`)).not.toBeNull();
		expect(container.querySelector(`.${CSS.escape('max-w-[1200px]')}`)).toBeNull();
		// The prose column sits at the frame's left edge, where the skeleton's
		// heading sits, rather than centring itself in the wider frame.
		const prose = container.querySelector('h1')?.closest(`.${CSS.escape('max-w-[46rem]')}`);
		expect(prose).not.toBeNull();
		expect(prose?.classList.contains('mx-auto')).toBe(false);
		expect(prose?.parentElement?.classList.contains('mx-auto')).toBe(false);
	});

	// The frame pads the page and the skeleton reads the same `page` padding,
	// so the stub's badge lands where the skeleton's title bar sat only if the
	// grid inside the frame adds no vertical padding of its own. It carried
	// `py-6` on top of the frame's `py-6 md:py-8`, which put the badge 56px
	// below the stage top on a desktop screen against the skeleton's 32px
	// (#1060).
	it('adds no vertical padding inside the frame the skeleton shares', () => {
		const { container } = renderAt('/gis/data-explorer');
		const frame = container.firstElementChild;
		const grid = container.querySelector('h1')?.closest('header')?.parentElement;
		expect(frame?.className).toBe(
			pageContainer({ flow: 'block', gap: 'none', measure: 'record', padding: 'page' }),
		);
		expect(grid?.parentElement).toBe(frame);
		expect(grid?.className.split(/\s+/).filter((cls) => /^-?(p|py|pt|pb)-/.test(cls))).toEqual([]);
	});
});

function renderAt(activePath: string) {
	return render(
		<ShellProvider
			activePath={activePath}
			currentOrganization={{ id: 'org_1', name: 'Test Organization' }}
			domains={domains()}
			onNavigate={() => undefined}
			onSelectOrganization={() => undefined}
			organizations={[{ id: 'org_1', name: 'Test Organization' }]}
			user={{ name: 'Crew', email: 'crew@example.test' }}
		>
			<UpcomingPage />
		</ShellProvider>,
	);
}

function hrefs(): readonly string[] {
	return screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
}

function willLandLines(): readonly Element[] {
	return Array.from(
		screen.getByText('What will land here').parentElement?.querySelectorAll('li') ?? [],
	);
}

function stubPaths(): readonly string[] {
	return stubItems(domains()).map((item) => String(item.to));
}

function domains() {
	return shellDomainsForRole(OWNER);
}

const OWNER = signedInSnapshotAs('owner');
