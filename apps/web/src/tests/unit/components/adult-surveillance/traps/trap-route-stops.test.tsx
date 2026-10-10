/** @vitest-environment jsdom */
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrapRouteStopEditor } from '../../../../../components/adult-surveillance/traps/trap-route-stop-editor';
import { TrapRouteStopList } from '../../../../../components/adult-surveillance/traps/trap-route-stop-list';
import type { TrapRouteStopView } from '../../../../../hooks/adult-surveillance/use-trap-route-stops';

/**
 * The stop rows on the Trap Route detail and edit pages, for a stop whose Trap
 * has not streamed and for one whose Trap has. Until #1600 the first drew the
 * active tone and no `Inactive` word on both pages, so it read as an active
 * stop.
 */

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../../routes/route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

afterEach(cleanup);

const SHARED = {
	routeItemId: 'i1',
	trapId: '5e6f7a8b-0000-4000-8000-000000000001',
	ordinal: 1,
	position: 1,
	directionsToNextItem: null,
} as const;

const RESOLVING: TrapRouteStopView = {
	...SHARED,
	name: 'Trap 5e6f7a8b',
	lat: null,
	lng: null,
	hasLocation: false,
	isResolving: true,
};

const INACTIVE: TrapRouteStopView = {
	...SHARED,
	name: 'A-1',
	lat: 34.05,
	lng: -118.24,
	hasLocation: true,
	isResolving: false,
	isActive: false,
};

/*
 * The status is the Trap's, so a stop carries it only once narrowed to
 * resolved: reading it off the union is a `tsc` error.
 */
function _statusOf(stop: TrapRouteStopView) {
	// @ts-expect-error A resolving stop has no `isActive` to read.
	void stop.isActive;
	return stop.isResolving ? null : stop.isActive;
}
void _statusOf;

function badgeTone(): string | null {
	return document.querySelector('[data-tone]')?.getAttribute('data-tone') ?? null;
}

function renderList(stop: TrapRouteStopView) {
	const noop = () => {};
	render(
		<TrapRouteStopList
			selection={{ selectedStopId: null, onSelect: noop, onHover: noop }}
			stops={[stop]}
		/>,
	);
}

function renderEditor(stop: TrapRouteStopView) {
	const noop = () => {};
	render(
		<TooltipProvider>
			<TrapRouteStopEditor
				canSubmit
				isLoading={false}
				onMove={noop}
				onRemove={noop}
				onSetDirections={noop}
				stops={[stop]}
			/>
		</TooltipProvider>,
	);
}

describe.each([
	['TrapRouteStopList', renderList],
	['TrapRouteStopEditor', renderEditor],
])('%s', (_name, renderStop) => {
	it('draws a resolving stop with the resolving badge and Loading…', () => {
		renderStop(RESOLVING);

		expect(badgeTone()).toBe('resolving');
		expect(screen.getByText('Loading…')).toBeTruthy();
	});

	it('draws an arrived stop in its tone with its status', () => {
		renderStop(INACTIVE);

		expect(badgeTone()).toBe('inactive');
		expect(screen.getByText('Inactive')).toBeTruthy();
		expect(screen.queryByText('Loading…')).toBeNull();
	});
});
