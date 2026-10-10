// @vitest-environment jsdom
/**
 * The canvas's padding settling on what it asked for.
 *
 * A camera move that starts inside the hook's 300 ms padding ease stops it, and
 * mapbox keeps whatever padding the ease had reached. Mapbox fires `moveend`
 * for the stopped ease from inside the interrupting call's `stop()`, before
 * that call has started its own move, so the hook waits a frame and asks
 * `isMoving` before it writes (#1490).
 */
import type { Map as MapboxMap } from 'mapbox-gl';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapInset } from '../../../../components/map/map-inset';
import { useMapPadding } from '../../../../hooks/map/use-map-padding';
import { cleanupRenderedHooks, createFakeMap, renderHook } from '../../components/map/fake-map';

const PANEL: MapInset = { top: 0, right: 0, bottom: 0, left: 416 };
const COLLAPSED: MapInset = { top: 0, right: 0, bottom: 0, left: 48 };
/** Where a 300 ms ease from the panel to the collapsed rail had got to when it was stopped. */
const PARTWAY = { top: 0, right: 0, bottom: 0, left: 230 };

function usePadding(props: { readonly map: MapboxMap; readonly inset: MapInset }): void {
	useMapPadding(props.map, true, props.inset);
}

/** A map whose canvas has asked for the panel and then the collapsed rail. */
function collapsedMap() {
	const fake = createFakeMap();
	const hook = renderHook(usePadding, { map: fake.map, inset: PANEL });
	hook.rerender({ map: fake.map, inset: COLLAPSED });
	return { fake, hook, callsBefore: fake.cameraCalls.length };
}

/** A move ending, and the frame after it, which is when the hook looks. */
function endMove(fake: ReturnType<typeof createFakeMap>) {
	act(() => {
		fake.emit('moveend');
	});
	act(() => {
		vi.advanceTimersToNextFrame();
	});
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});

afterEach(() => {
	vi.useRealTimers();
	cleanupRenderedHooks();
});

describe('useMapPadding', () => {
	it('asks for its inset again when a move ends with the padding left partway', () => {
		const { fake, callsBefore } = collapsedMap();
		fake.strandPadding(PARTWAY);

		endMove(fake);

		expect(fake.cameraCalls).toHaveLength(callsBefore + 1);
		expect(fake.cameraCalls.at(-1)).toEqual(
			expect.objectContaining({ kind: 'easeTo', padding: COLLAPSED }),
		);
		expect(fake.map.getPadding()).toEqual(COLLAPSED);
	});

	it('writes nothing from a move end while the map is still moving', () => {
		const { fake, callsBefore } = collapsedMap();
		fake.strandPadding(PARTWAY);
		fake.setMoving(true);

		endMove(fake);

		expect(fake.cameraCalls).toHaveLength(callsBefore);
	});

	// The `moveend` for a stopped ease fires inside the call that stopped it,
	// before that call has set the map moving. Writing then would stop the new
	// move in turn.
	it('writes nothing when a move starts in the same task as the move end', () => {
		const { fake, callsBefore } = collapsedMap();
		fake.strandPadding(PARTWAY);

		act(() => {
			fake.emit('moveend');
			fake.setMoving(true);
		});
		act(() => {
			vi.advanceTimersToNextFrame();
		});

		expect(fake.cameraCalls).toHaveLength(callsBefore);
	});

	it('makes no camera call when a move ends with the padding already right', () => {
		const { fake, callsBefore } = collapsedMap();

		endMove(fake);

		expect(fake.cameraCalls).toHaveLength(callsBefore);
	});

	it('stops listening for move ends once it unmounts', () => {
		const { fake, hook } = collapsedMap();
		expect(fake.listenerCount('moveend')).toBe(1);

		hook.unmount();

		expect(fake.listenerCount('moveend')).toBe(0);
	});

	it('drops a look it had scheduled when it unmounts before the frame', () => {
		const { fake, hook, callsBefore } = collapsedMap();
		fake.strandPadding(PARTWAY);
		act(() => {
			fake.emit('moveend');
		});

		hook.unmount();
		act(() => {
			vi.advanceTimersToNextFrame();
		});

		expect(fake.cameraCalls).toHaveLength(callsBefore);
	});
});
