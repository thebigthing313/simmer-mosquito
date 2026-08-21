/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { ReactNode } from 'react';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MinimumRole } from '../../../../lib/write-access';

// The role floor the create control is drawn against. `useHasRole` reads the
// auth snapshot, which is a network fact; the ladder itself is covered by
// `lib/write-access` tests, so the frame only needs to be told yes or no.
const RANK: Record<string, number | undefined> = {
	viewer: 0,
	collector: 1,
	manager: 2,
	admin: 3,
	owner: 4,
};
let signedInRole = 'admin';

vi.mock('../../../../hooks/use-can-write', () => ({
	useHasRole: (minimum: MinimumRole) => (RANK[signedInRole] ?? 0) >= (RANK[minimum] ?? 0),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
}));

// jsdom has neither, and both the panel (viewport width) and the map hooks
// (element size) read them.
let isNarrowViewport = false;
const mediaListeners = new Set<() => void>();
vi.stubGlobal('matchMedia', (query: string) => ({
	get matches() {
		return isNarrowViewport;
	},
	media: query,
	addEventListener: (_event: string, handler: () => void) => mediaListeners.add(handler),
	removeEventListener: (_event: string, handler: () => void) => mediaListeners.delete(handler),
}));
vi.stubGlobal(
	'ResizeObserver',
	class {
		observe() {}
		unobserve() {}
		disconnect() {}
	},
);

function setViewport(narrow: boolean) {
	isNarrowViewport = narrow;
	act(() => {
		for (const listener of [...mediaListeners]) {
			listener();
		}
	});
}

const { ExplorerMapPage } = await import('../../../../components/explorer/explorer-map-page');
const { useExplorerPanel } = await import('../../../../components/explorer/use-explorer-panel');
const { useFlyToSelection } = await import('../../../../components/explorer/use-fly-to-selection');
const { useMapExtentFit } = await import('../../../../components/map/use-map-extent-fit');
const { createFakeMap } = await import('../map/fake-map');

afterEach(() => {
	cleanup();
	signedInRole = 'admin';
	isNarrowViewport = false;
	mediaListeners.clear();
});

interface Row {
	readonly id: string;
	readonly name: string;
}

const ROWS: readonly Row[] = [
	{ id: 'a', name: 'Culvert 12' },
	{ id: 'b', name: 'Roadside ditch' },
];

/**
 * The frame as a route drives it. `panel` comes from the hook rather than a
 * literal, because the collapse state and the inset it produces are one thing
 * and a test that fabricated the inset would not be testing the pair.
 */
function Page({
	rows = ROWS,
	isLoading = false,
	activeFilterCount = 2,
	create = { to: '/larval-surveillance/habitats/create', label: 'Add Habitat' } as
		| { readonly to: string; readonly label: string; readonly minimum?: MinimumRole }
		| undefined,
}: {
	readonly rows?: readonly Row[];
	readonly isLoading?: boolean;
	readonly activeFilterCount?: number;
	readonly create?:
		| { readonly to: string; readonly label: string; readonly minimum?: MinimumRole }
		| undefined;
}) {
	const panel = useExplorerPanel();
	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={<p>filter controls</p>}
			footer={<p>pager</p>}
			heading={{
				title: 'Habitats',
				total: rows.length,
				isLoading,
				noun: { one: 'habitat', many: 'habitats' },
				create: create as never,
			}}
			map={<p>map surface</p>}
			panel={panel}
			results={{
				rows,
				emptyTitle: 'No habitats in view',
				emptyDescription: 'Loosen the filters to bring habitats into range.',
				renderRow: (row) => <li key={row.id}>{row.name}</li>,
			}}
		/>
	);
}

describe('ExplorerMapPage', () => {
	it('keeps the result count and the active filter count readable once the panel is collapsed', () => {
		render(<Page />);
		expect(screen.getByText('2 habitats')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));

		expect(screen.getByText('2 habitats')).toBeTruthy();
		expect(screen.getByText('2 filters')).toBeTruthy();
		expect(screen.queryByText('filter controls')).toBeNull();
	});

	it('gives the panel back from the same control it was collapsed with', () => {
		render(<Page />);

		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));
		fireEvent.click(screen.getByRole('button', { name: 'Show results' }));

		expect(screen.getByText('filter controls')).toBeTruthy();
		expect(screen.getByText('Culvert 12')).toBeTruthy();
	});

	it('leaves the map mounted through a collapse, so collapsing does not reload it', () => {
		render(<Page />);
		const before = screen.getByText('map surface');

		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));

		expect(screen.getByText('map surface')).toBe(before);
	});

	it('offers the create control only at or above the floor its command needs', () => {
		signedInRole = 'collector';
		const { rerender } = render(<Page create={{ to: '/x', label: 'Add Habitat' }} />);
		expect(screen.getByText('Add Habitat')).toBeTruthy();

		rerender(<Page create={{ to: '/x', label: 'Add Habitat', minimum: 'manager' }} />);
		expect(screen.queryByText('Add Habitat')).toBeNull();
	});

	it('shows neither rows nor a reason while the first page is still loading', () => {
		render(<Page isLoading rows={[]} />);

		expect(screen.queryByText('No habitats in view')).toBeNull();
		expect(screen.queryByText('Culvert 12')).toBeNull();
	});

	it('says why the list is empty rather than showing an empty list', () => {
		render(<Page rows={[]} />);

		expect(screen.getByText('No habitats in view')).toBeTruthy();
		expect(screen.getByText('Loosen the filters to bring habitats into range.')).toBeTruthy();
	});

	it('keeps the rows on screen while a later page loads', () => {
		render(<Page isLoading />);

		expect(screen.getByText('Culvert 12')).toBeTruthy();
	});
});

function lastCall(fake: ReturnType<typeof createFakeMap>, kind: string) {
	return fake.cameraCalls.filter((call) => call.kind === kind).at(-1);
}

describe('the inset the panel hands the map', () => {
	const BOX = { west: -95.4, south: 29.6, east: -95.2, north: 29.8 };
	const SELECTED = { lat: 29.7, lng: -95.3 };

	let fake: ReturnType<typeof createFakeMap>;

	beforeEach(() => {
		fake = createFakeMap();
	});

	function mountProbe() {
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const panel = { current: null as ReturnType<typeof useExplorerPanel> | null };

		function Probe() {
			const state = useExplorerPanel();
			panel.current = state;
			useFlyToSelection(fake.map as MapboxMap, SELECTED, state.inset);
			useMapExtentFit(fake.map as MapboxMap, true, { bounds: BOX }, state.inset);
			return null;
		}

		act(() => {
			root.render(
				<StrictMode>
					<QueryClientProvider client={new QueryClient()}>
						<Probe />
					</QueryClientProvider>
				</StrictMode>,
			);
		});

		return {
			panel,
			collapse(next: boolean) {
				act(() => {
					panel.current?.setCollapsed(next);
				});
			},
			unmount() {
				act(() => {
					root.unmount();
				});
				container.remove();
			},
		};
	}

	it('flies a selection into the half of the map the panel is not covering', () => {
		const probe = mountProbe();

		const fly = lastCall(fake, 'flyTo');
		expect(fly?.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 396 });

		probe.unmount();
	});

	it('frames an extent clear of the panel, keeping the map its own breathing room', () => {
		const probe = mountProbe();

		const fit = lastCall(fake, 'fitBounds');
		expect(fit?.padding).toEqual({ top: 56, right: 56, bottom: 56, left: 452 });

		probe.unmount();
	});

	it('gives the room back to the camera once the panel is collapsed', () => {
		const probe = mountProbe();

		probe.collapse(true);

		const fly = lastCall(fake, 'flyTo');
		expect(fly?.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });

		probe.unmount();
	});

	it('pads the bottom instead of the side where the panel docks as a sheet', () => {
		setViewport(true);
		const probe = mountProbe();

		const fly = lastCall(fake, 'flyTo');
		expect(fly?.padding).toEqual({ top: 0, right: 0, bottom: 260, left: 0 });

		probe.unmount();
	});
});
