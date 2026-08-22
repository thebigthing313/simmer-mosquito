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

// The panel measures the map stage and its own box, so jsdom needs an observer
// that actually reports one. Every observed element reports the same size, which
// is all these assertions distinguish.
let observedBox = { width: 1000, height: 700 };
type ObserverCallback = (entries: readonly { readonly contentRect: typeof observedBox }[]) => void;
const liveObservers = new Set<ObserverCallback>();

vi.stubGlobal(
	'ResizeObserver',
	class {
		private readonly callback: ObserverCallback;
		constructor(callback: ObserverCallback) {
			this.callback = callback;
		}
		observe() {
			liveObservers.add(this.callback);
			this.callback([{ contentRect: observedBox }]);
		}
		unobserve() {}
		disconnect() {
			liveObservers.delete(this.callback);
		}
	},
);

/** Resize every observed element, as a viewport change would. */
function setObservedBox(box: { width: number; height: number }) {
	observedBox = box;
	act(() => {
		for (const callback of [...liveObservers]) {
			callback([{ contentRect: observedBox }]);
		}
	});
}

const { ExplorerMapPage } = await import('../../../../components/explorer/explorer-map-page');
const { useExplorerPanel } = await import('../../../../components/explorer/use-explorer-panel');
const { useFlyToSelection } = await import('../../../../components/explorer/use-fly-to-selection');
const { useMapExtentFit } = await import('../../../../components/map/use-map-extent-fit');
const { useMapPadding } = await import('../../../../components/map/use-map-padding');
const { useMapBoundsParam } = await import('../../../../components/explorer/use-map-bounds');
const { createFakeMap } = await import('../map/fake-map');

afterEach(() => {
	cleanup();
	signedInRole = 'admin';
	observedBox = { width: 1000, height: 700 };
	liveObservers.clear();
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

	// The filters sit in a panel of their own above the results, so that setting
	// them and scrolling the rows are not the same scroll container.
	it('puts the filter controls away behind a button that still carries the count', () => {
		render(<Page />);
		expect(screen.getByText('filter controls')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));

		expect(screen.queryByText('filter controls')).toBeNull();
		// The rows stay: putting the filters away is not putting the results away.
		expect(screen.getByText('Culvert 12')).toBeTruthy();
		const filtersButton = screen.getByRole('button', { name: /Filters/ });
		expect(filtersButton.textContent).toContain('2');

		fireEvent.click(filtersButton);
		expect(screen.getByText('filter controls')).toBeTruthy();
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

	function mountProbe({ selected }: { readonly selected: typeof SELECTED | null }) {
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const panel = { current: null as ReturnType<typeof useExplorerPanel> | null };

		function Probe() {
			const state = useExplorerPanel();
			panel.current = state;
			useFlyToSelection(fake.map as MapboxMap, selected);
			useMapPadding(fake.map as MapboxMap, true, state.inset);
			useMapExtentFit(fake.map as MapboxMap, true, { bounds: BOX }, state.inset);
			return <div ref={state.stageRef} />;
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

	it('pads the map viewport by the side the panel is on', () => {
		const probe = mountProbe({ selected: SELECTED });

		expect(lastCall(fake, 'easeTo')?.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 396 });

		probe.unmount();
	});

	it('frames an extent clear of the panel, keeping the map its own breathing room', () => {
		const probe = mountProbe({ selected: SELECTED });

		expect(lastCall(fake, 'fitBounds')?.padding).toEqual({
			top: 56,
			right: 56,
			bottom: 56,
			left: 452,
		});

		probe.unmount();
	});

	// The bug this replaced: padding rode on the fly-to, so a reader who dropped
	// the selection and *then* collapsed left the map framed for a panel that was
	// no longer there, with no camera call due to put it back.
	it('gives the room back on a collapse even when nothing is selected', () => {
		const probe = mountProbe({ selected: null });

		probe.collapse(true);

		expect(lastCall(fake, 'easeTo')?.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });

		probe.unmount();
	});

	it('leaves the selection fly-to carrying no padding of its own', () => {
		const probe = mountProbe({ selected: SELECTED });

		expect(lastCall(fake, 'flyTo')?.padding).toBeUndefined();

		probe.unmount();
	});

	it('pads the bottom by the sheet it measured, where the stage is too narrow for a column', () => {
		setObservedBox({ width: 500, height: 300 });
		const probe = mountProbe({ selected: SELECTED });

		expect(probe.panel.current?.isNarrow).toBe(true);
		// 70% of the 300px stage, plus the gap under the sheet.
		expect(lastCall(fake, 'easeTo')?.padding).toEqual({ top: 0, right: 0, bottom: 222, left: 0 });

		probe.unmount();
	});

	// Mapbox subtracts viewport padding from getBounds, so once the canvas owns
	// padding a list keyed on it would drop every record behind the panel and
	// change its own count on a collapse. Measured at 215 records against 129 on
	// one Habitat viewport before this was read off the canvas instead.
	it('asks the list for the whole canvas, not the strip beside the panel', () => {
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		const seen: (string | null)[] = [];

		function Probe() {
			seen.push(useMapBoundsParam(fake.map as MapboxMap));
			return null;
		}
		act(() => {
			root.render(<Probe />);
		});

		// The full 1000x800 canvas, not the 0.2..0.4 box getBounds reports.
		expect(seen.at(-1)).toBe('0,-0.8,1,0');

		act(() => {
			root.unmount();
		});
		container.remove();
	});

	it('keeps the side column while the stage is wide enough to leave a usable map', () => {
		setObservedBox({ width: 800, height: 700 });
		const probe = mountProbe({ selected: SELECTED });

		expect(probe.panel.current?.isNarrow).toBe(false);

		probe.unmount();
	});
});
