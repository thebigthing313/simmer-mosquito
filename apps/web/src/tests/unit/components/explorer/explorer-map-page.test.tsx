/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { ReactNode } from 'react';
import { act, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExplorerEmptyReason } from '../../../../components/explorer/explorer-empty-state';
import type { ExplorerPanel } from '../../../../hooks/explorer/use-explorer-panel';
import type { MinimumRole } from '../../../../lib/write-access';
import { stubRailViewportHeight } from '../../rail-viewport-stub';

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
interface ObserverEntry {
	readonly contentRect: typeof observedBox;
	readonly target: Element;
}
type ObserverCallback = (entries: readonly ObserverEntry[]) => void;
/*
 * Which elements each observer is watching, not just which observers are live.
 * The rail's virtualizer observes every mounted row and reads the row's index
 * back off `entry.target`, so an entry without one is a crash rather than a
 * missing measurement.
 */
const liveObservers = new Map<ObserverCallback, Set<Element>>();

function observerEntry(target: Element): ObserverEntry {
	return { contentRect: observedBox, target };
}

vi.stubGlobal(
	'ResizeObserver',
	class {
		private readonly callback: ObserverCallback;
		constructor(callback: ObserverCallback) {
			this.callback = callback;
		}
		observe(target: Element) {
			const watched = liveObservers.get(this.callback) ?? new Set<Element>();
			watched.add(target);
			liveObservers.set(this.callback, watched);
			this.callback([observerEntry(target)]);
		}
		unobserve(target: Element) {
			liveObservers.get(this.callback)?.delete(target);
		}
		disconnect() {
			liveObservers.delete(this.callback);
		}
	},
);

/*
 * The rail mounts only the rows in view, and both halves of that are read off
 * `offsetHeight`: how tall the scroll container is, and how tall each row is.
 * jsdom does no layout, so every box is zero and a virtual list in it renders
 * nothing at all, and the rows would be missing here for a reason that has
 * nothing to do with what these tests check. The viewport reads the observed
 * box through the reader, so a resize case moves the row window, and a row
 * reports `STUB_ROW_HEIGHT`. Every other element keeps jsdom's zero: the panel
 * measures itself off the observer's `contentRect`, not off `offsetHeight`,
 * and nothing else in the frame reads the property.
 */
stubRailViewportHeight(() => observedBox.height);
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
	configurable: true,
	get: () => observedBox.width,
});

/** Resize every observed element, as a viewport change would. */
function setObservedBox(box: { width: number; height: number }) {
	observedBox = box;
	act(() => {
		for (const [callback, watched] of [...liveObservers]) {
			callback([...watched].map(observerEntry));
		}
	});
}

const { ExplorerMapPage } = await import('../../../../components/explorer/explorer-map-page');
const { useExplorerPanel } = await import('../../../../hooks/explorer/use-explorer-panel');
const { useFlyToSelection } = await import('../../../../hooks/explorer/use-fly-to-selection');
const { useMapExtentFit } = await import('../../../../hooks/map/use-map-extent-fit');
const { useMapPadding } = await import('../../../../hooks/map/use-map-padding');
const { useMapBoundsParam } = await import('../../../../hooks/explorer/use-map-bounds-param');
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

/** A full page of results, which is what `PAGE_SIZE` hands the rail. */
const PAGE_OF_ROWS: readonly Row[] = Array.from({ length: 50 }, (_, index) => ({
	id: `r${index + 1}`,
	name: `Site ${index + 1}`,
}));

/**
 * The frame as a route drives it. `panel` comes from the hook rather than a
 * literal, because the collapse state and the inset it produces are one thing
 * and a test that fabricated the inset would not be testing the pair.
 */
function Page({
	rows = ROWS,
	isLoading = false,
	activeFilterCount = 2,
	body,
	bodyIsEmpty = false,
	hasCreate = true,
	hasPager = true,
	hasReset = true,
	emptyReason,
	onResetFilters = () => {},
	create = { to: '/larval-surveillance/habitats/create', label: 'Add Habitat' } as
		| { readonly to: string; readonly label: string; readonly minimum?: MinimumRole }
		| undefined,
}: {
	readonly rows?: readonly Row[];
	readonly isLoading?: boolean;
	readonly activeFilterCount?: number;
	readonly body?: ReactNode;
	readonly bodyIsEmpty?: boolean;
	readonly hasCreate?: boolean;
	readonly hasPager?: boolean;
	readonly hasReset?: boolean;
	/**
	 * Hand over the paged shape instead of two sentences, which is what the nine
	 * viewport-paged explorers do, and let the frame write the copy.
	 */
	readonly emptyReason?: ExplorerEmptyReason | null;
	readonly onResetFilters?: () => void;
	readonly create?:
		| { readonly to: string; readonly label: string; readonly minimum?: MinimumRole }
		| undefined;
}) {
	const panel = useExplorerPanel();
	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={<p>filter controls</p>}
			footer={hasPager ? <p>pager</p> : undefined}
			heading={{
				title: 'Habitats',
				total: rows.length,
				isLoading,
				counts: 'habitat',
				create: (hasCreate ? create : undefined) as never,
			}}
			map={<p>map surface</p>}
			onResetFilters={hasReset ? onResetFilters : undefined}
			panel={panel}
			results={
				emptyReason !== undefined
					? {
							rows,
							empty: { recordType: 'habitat', reason: emptyReason },
							renderRow: (row) => <span key={row.id}>{row.name}</span>,
						}
					: body === undefined
						? {
								rows,
								emptyTitle: 'No habitats in view',
								emptyDescription: 'Loosen the filters to bring habitats into range.',
								// The list item belongs to the rail, which positions and measures
								// it. A caller renders the row's contents.
								renderRow: (row) => <span key={row.id}>{row.name}</span>,
							}
						: {
								body,
								isEmpty: bodyIsEmpty,
								emptyTitle: 'No habitats in view',
								emptyDescription: 'Loosen the filters to bring habitats into range.',
							}
			}
		/>
	);
}

/** The placeholder rows the frame draws for a first load, which carry no text. */
function skeletonCount() {
	return document.querySelectorAll('[data-slot="skeleton"]').length;
}

describe('ExplorerMapPage', () => {
	it('keeps the result count and the active filter count readable once the panel is collapsed', () => {
		render(<Page />);
		// Expanded, the count belongs to the panel's footer. A header that also
		// carried it would state the same number twice in one panel.
		expect(screen.queryByText('2 habitats')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));

		expect(screen.getByText('2 habitats')).toBeTruthy();
		expect(screen.getByText('2 filters')).toBeTruthy();
	});

	// The filters sit in a card beside the results, so that setting them and
	// scrolling the rows are not the same scroll container, and so the rail keeps
	// the full height of the stage.
	it('opens the filter card from the header and shuts it again', () => {
		render(<Page />);
		// Shut to begin with: the card covers a second column of map, and nothing
		// has asked for it yet.
		expect(screen.queryByText('filter controls')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		expect(screen.getByText('filter controls')).toBeTruthy();
		// The rows stay through both: the card is beside them, not over them.
		expect(screen.getByText('Culvert 12')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		expect(screen.queryByText('filter controls')).toBeNull();
		expect(screen.getByText('Culvert 12')).toBeTruthy();
	});

	// Shut, the toggle is the only thing on screen that knows the list is cut
	// down. Without the number a reader cannot tell a surface with nothing in
	// range from one whose filters excluded everything.
	it('carries the active filter count on the toggle while the card is shut', () => {
		const { rerender } = render(<Page />);
		expect(screen.getByRole('button', { name: 'Filters' }).textContent).toContain('2');

		rerender(<Page activeFilterCount={0} />);
		expect(screen.getByRole('button', { name: 'Filters' }).textContent).toBe('');
	});

	// The Regions tree and Daily Work's grouped log are not flat lists, so they
	// fill the rows slot with a body instead of rows.
	it('draws a caller-supplied body in place of the rows', () => {
		render(<Page body={<p>folder tree</p>} />);

		expect(screen.getByText('folder tree')).toBeTruthy();
		// The rows are ignored rather than drawn underneath it.
		expect(screen.queryByText('Culvert 12')).toBeNull();
		// Everything else the frame owns still stands: the header, the pager and the
		// collapse. The filter card is shut, as it is on any first render.
		expect(screen.getByText('pager')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Hide results' })).toBeTruthy();
	});

	// Story 26 for a body caller: the activity log used to blank back to
	// placeholders every time the reader moved the date window under it.
	it('leaves a body on screen while it reloads, rather than going back to placeholders', () => {
		render(<Page body={<p>folder tree</p>} isLoading />);

		expect(screen.getByText('folder tree')).toBeTruthy();
		expect(skeletonCount()).toBe(0);
	});

	// Story 27 for a body caller: the copy both body callers were passing into a
	// branch that dropped it now reaches the reader.
	it('says why a body is empty, in the copy the caller passed', () => {
		render(<Page body={<p>folder tree</p>} bodyIsEmpty />);

		expect(screen.getByText('No habitats in view')).toBeTruthy();
		expect(screen.getByText('Loosen the filters to bring habitats into range.')).toBeTruthy();
		expect(screen.queryByText('folder tree')).toBeNull();
	});

	// Story 25 for a body caller: empty and still loading is not yet empty.
	it('draws placeholder rows rather than the empty state while an empty body loads', () => {
		render(<Page body={<p>folder tree</p>} bodyIsEmpty isLoading />);

		expect(skeletonCount()).toBeGreaterThan(0);
		expect(screen.queryByText('No habitats in view')).toBeNull();
	});

	it('gives the panel back from the same control it was collapsed with', () => {
		render(<Page />);

		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));
		fireEvent.click(screen.getByRole('button', { name: 'Show results' }));

		// The filter card was open when the panel went away and is open again with
		// it: a collapse is putting the panel down, not clearing what was set.
		expect(screen.getByText('filter controls')).toBeTruthy();
		expect(screen.getByText('Culvert 12')).toBeTruthy();
	});

	it('leaves the map mounted through a collapse, so collapsing does not reload it', () => {
		render(<Page />);
		const before = screen.getByText('map surface');

		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));

		expect(screen.getByText('map surface')).toBe(before);
	});

	// The create action is a menu item in this frame rather than a button of its
	// own, so the floor has to hold inside the menu too.
	it('offers the create control only at or above the floor its command needs', async () => {
		signedInRole = 'collector';
		const { rerender } = render(<Page create={{ to: '/x', label: 'Create Habitat' }} />);
		fireEvent.pointerDown(
			screen.getByRole('button', { name: 'More actions' }),
			new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
		);
		expect(await screen.findByText('Create Habitat')).toBeTruthy();

		rerender(<Page create={{ to: '/x', label: 'Create Habitat', minimum: 'manager' }} />);
		expect(screen.queryByText('Create Habitat')).toBeNull();
	});

	// Nothing to create and nothing to reset is a menu with nothing in it.
	it('leaves the menu out when the surface has neither action', () => {
		render(<Page hasCreate={false} hasReset={false} />);

		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});

	// The pager states the count, so the header would be saying it twice. Without
	// a pager the header is the only place left.
	it('states the count in the header only when there is no pager under it', () => {
		const { rerender } = render(<Page />);
		expect(screen.queryByText('2 habitats')).toBeNull();

		rerender(<Page hasPager={false} />);
		expect(screen.getByText('2 habitats')).toBeTruthy();
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

	/*
	 * The nine viewport-paged explorers hand over why the page is empty rather
	 * than two sentences, and the frame writes the copy from what it holds: the
	 * register's noun, the create action, the filter count and the filter card
	 * (#958). Three branches, one sentence each, asserted as a reader sees them.
	 */
	describe('the paged empty state', () => {
		it('says to pan when matches exist somewhere outside the viewport', () => {
			render(<Page emptyReason="viewport" rows={[]} />);

			expect(screen.getByText('No habitats in view')).toBeTruthy();
			expect(
				screen.getByText(
					'Pan or zoom the map, or loosen the filters to bring habitats into range.',
				),
			).toBeTruthy();
		});

		it('offers the reset when a filter is set and nothing matches anywhere', () => {
			const onResetFilters = vi.fn();
			render(
				<Page
					activeFilterCount={2}
					emptyReason="filters"
					onResetFilters={onResetFilters}
					rows={[]}
				/>,
			);

			expect(screen.getByText('No habitats match these filters')).toBeTruthy();
			fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
			expect(onResetFilters).toHaveBeenCalledTimes(1);
		});

		// At the defaults there is nothing to reset, and what narrowed the request
		// is in the filter card, so the control opens it.
		it('opens the filter card when the defaults are what excluded everything', () => {
			render(<Page activeFilterCount={0} emptyReason="filters" rows={[]} />);

			expect(screen.getByText('No habitats match these filters')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Reset filters' })).toBeNull();
			expect(screen.queryByText('filter controls')).toBeNull();

			fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
			expect(screen.getByText('filter controls')).toBeTruthy();
		});

		it('points at the create control, by the label it draws, when there are none yet', () => {
			render(<Page create={{ to: '/x', label: 'Create Habitat' }} emptyReason="none" rows={[]} />);

			expect(screen.getByText('No habitats yet')).toBeTruthy();
			expect(screen.getByText('Create Habitat is in the More actions menu.')).toBeTruthy();
		});

		// The pointer sits behind the same floor the control does. A reader who
		// cannot add one is not sent to a menu item they cannot see.
		it('leaves the create pointer out below the floor the control needs', () => {
			signedInRole = 'viewer';
			render(<Page create={{ to: '/x', label: 'Create Habitat' }} emptyReason="none" rows={[]} />);

			expect(screen.getByText('No habitats yet')).toBeTruthy();
			expect(screen.queryByText('Create Habitat is in the More actions menu.')).toBeNull();
		});

		it('draws placeholders rather than a reason while the extent is still out', () => {
			render(<Page emptyReason={null} isLoading rows={[]} />);

			expect(skeletonCount()).toBeGreaterThan(0);
			expect(screen.queryByText('No habitats in view')).toBeNull();
			expect(screen.queryByText('No habitats yet')).toBeNull();
		});
	});

	it('keeps the rows on screen while a later page loads', () => {
		render(<Page isLoading />);

		expect(screen.getByText('Culvert 12')).toBeTruthy();
	});

	/*
	 * A page is 50 records and the rail shows about a dozen, so the whole page
	 * being mounted cost a 55ms long task on every viewport settle while the map
	 * was being dragged — and put 150 tab stops between the rail and its pager.
	 */
	it('mounts the rows in view rather than the whole page', () => {
		render(<Page rows={PAGE_OF_ROWS} />);

		const mounted = document.querySelectorAll('[data-index]').length;
		expect(mounted).toBeGreaterThan(0);
		expect(mounted).toBeLessThan(PAGE_OF_ROWS.length / 2);
		// The window starts where the reader is, which on first paint is the top.
		expect(screen.getByText('Site 1')).toBeTruthy();
	});

	// The viewport reads its height off the observed box, so a resize is a
	// smaller window. The virtualiser re-reads `offsetHeight` on every observer
	// entry that carries no `borderBoxSize`, which is what the stand-in fires.
	it('shrinks the row window with the stage', () => {
		render(<Page rows={PAGE_OF_ROWS} />);
		const tall = document.querySelectorAll('[data-index]').length;

		setObservedBox({ width: 1000, height: 120 });

		const short = document.querySelectorAll('[data-index]').length;
		expect(short).toBeGreaterThan(0);
		expect(short).toBeLessThan(tall);
	});

	/*
	 * Mounting a window is not on its own a way past it: tabbing into the last
	 * mounted row scrolls it and mounts the next, so Tab alone still walks the
	 * page three stops at a time. This is the bypass.
	 */
	it('offers a way past the rows to the pager', () => {
		render(<Page rows={PAGE_OF_ROWS} />);

		fireEvent.click(screen.getByRole('button', { name: 'Skip to paging' }));

		expect(document.activeElement?.contains(screen.getByText('pager'))).toBe(true);
	});

	it('leaves the bypass out when there is no pager to reach', () => {
		render(<Page hasPager={false} rows={PAGE_OF_ROWS} />);

		expect(screen.queryByRole('button', { name: 'Skip to paging' })).toBeNull();
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
		const panel = { current: null as ExplorerPanel | null };

		// Two things the compiler reads wrong about the obvious shape, measured
		// on `eslint-plugin-react-hooks@7.1.1` (#1184). Writing `panel.current =
		// state` during render is a mutation of the enclosing scope, so the state
		// is handed out through a prop after the commit. And `state.stageRef`,
		// which is the callback ref the page hands `OutletFullPageMap`, is read as
		// a ref access in render when reached through the member expression, and
		// so is `state.inset` beside it, because the object then holds a ref; the
		// page itself destructures the hook's result, and so does this.
		function Probe({ report }: { readonly report: (state: ExplorerPanel) => void }) {
			const state = useExplorerPanel();
			const { inset, stageRef } = state;
			useEffect(() => {
				report(state);
			});
			useFlyToSelection(fake.map as MapboxMap, selected);
			useMapPadding(fake.map as MapboxMap, true, inset);
			useMapExtentFit(fake.map as MapboxMap, true, { bounds: BOX }, inset);
			return <div ref={stageRef} />;
		}

		act(() => {
			root.render(
				<StrictMode>
					<QueryClientProvider client={new QueryClient()}>
						<Probe
							report={(state) => {
								panel.current = state;
							}}
						/>
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

		expect(lastCall(fake, 'easeTo')?.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 416 });

		probe.unmount();
	});

	it('frames an extent clear of the panel, keeping the map its own breathing room', () => {
		const probe = mountProbe({ selected: SELECTED });

		expect(lastCall(fake, 'fitBounds')?.padding).toEqual({
			top: 56,
			right: 56,
			bottom: 56,
			left: 472,
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
