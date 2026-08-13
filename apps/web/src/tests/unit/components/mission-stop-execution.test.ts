import { describe, expect, it } from 'vitest';
import { resolveActionLocation } from '../../../components/mission-stop-execution';

/**
 * A mission stop names the ground, so the crew does not have to draw it again.
 *
 * The four create pages relaxed the *form's* location requirement on a mission
 * stop and then threw "place the point" in their own save path regardless — so
 * the server's geometry default, which the whole relaxation exists for, could
 * never be reached from the UI. The rule lives here now, and this is the test
 * that it stays reachable.
 */
describe('resolveActionLocation', () => {
	const messages = { missing: 'Place the point.', unresolvable: 'Unable to read that shape.' };
	const point = { type: 'Point', coordinates: [-122.33, 47.61] };
	const stop = { lat: 47.6, lng: -122.3, geomType: 'polygon' };

	it('falls back to the stop when the crew drew nothing', () => {
		// No location source at all: the server reads the geometry off the stop, and
		// the optimistic row shows the stop's own centroid until sync answers.
		const location = resolveActionLocation({
			geometry: null,
			messages,
			missionItemId: 'mission-item-1',
			stop,
		});

		expect(location).toEqual({
			geomType: 'polygon',
			lat: 47.6,
			lng: -122.3,
			locationSource: undefined,
		});
	});

	it('still requires a point when there is no stop to fall back to', () => {
		expect(() =>
			resolveActionLocation({ geometry: null, messages, missionItemId: null, stop: null }),
		).toThrow('Place the point.');
	});

	it('prefers a drawn override to the stop, and sends it as a location source', () => {
		// Drawing on a mission stop is the treatment that ran wider or narrower than
		// planned — the case the coverage check then has an opinion about.
		const location = resolveActionLocation({
			geometry: point,
			messages,
			missionItemId: 'mission-item-1',
			stop,
		});

		expect(location.locationSource).toEqual({ geometry: point, kind: 'geometry' });
		expect(location.lat).toBeCloseTo(47.61);
	});

	it('waits rather than inventing a centroid before the stop has arrived', () => {
		// `mission_items` is an on-demand shape, so the row can be a moment behind
		// the page. Guessing a point here would write a lie the crew never drew.
		expect(() =>
			resolveActionLocation({
				geometry: null,
				messages,
				missionItemId: 'mission-item-1',
				stop: null,
			}),
		).toThrow('The mission stop is still loading.');
	});

	it('reports an unreadable shape rather than dropping the location', () => {
		expect(() =>
			resolveActionLocation({
				geometry: { type: 'Nonsense', coordinates: [] },
				messages,
				missionItemId: null,
				stop: null,
			}),
		).toThrow('Unable to read that shape.');
	});
});
