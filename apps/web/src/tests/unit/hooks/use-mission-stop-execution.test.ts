import { describe, expect, it } from 'vitest';
import type { DrawGeometry } from '../../../hooks/map/use-map-draw';
import { resolveActionLocation } from '../../../hooks/use-mission-stop-execution';

/**
 * Where a control action happened, from the geometry on the form.
 *
 * A form opened off a mission stop draws the stop's shape before anyone touches
 * the map (#1233), so a location is required on a stop the same as off one: an
 * empty map on a stop is a cleared geometry, and saving it used to fall back to
 * the stop's ground with nothing on screen saying so.
 *
 * What stays is the case the fallback was for. A geometry still exactly the
 * stop's is sent as no geometry at all, and the server copies the stop's stored
 * shape. Sending the copy instead would round-trip it through `st_asgeojson`,
 * which keeps nine decimal places, and a copy rounded off the stored shape need
 * not cover it, so an untouched save would ask the crew to confirm the coverage
 * check for a treatment placed exactly where they were sent.
 */
describe('resolveActionLocation', () => {
	const messages = { missing: 'Place the point.', unresolvable: 'Unable to read that shape.' };
	const point: DrawGeometry = { type: 'Point', coordinates: [-122.33, 47.61] };
	const stopArea: DrawGeometry = {
		type: 'Polygon',
		coordinates: [
			[
				[-122.3, 47.6],
				[-122.3, 47.62],
				[-122.28, 47.62],
				[-122.3, 47.6],
			],
		],
	};

	it('sends no geometry when the form still holds the stop geometry', () => {
		const location = resolveActionLocation({
			geometry: structuredClone(stopArea),
			messages,
			stopGeometry: stopArea,
		});

		expect(location.locationSource).toBeUndefined();
		expect(location.geomType).toBe('st_polygon');
		expect(location.lat).toBeCloseTo(47.613, 2);
		expect(location.lng).toBeCloseTo(-122.293, 2);
	});

	it('sends an edited geometry as a location source', () => {
		const location = resolveActionLocation({ geometry: point, messages, stopGeometry: stopArea });

		expect(location.locationSource).toEqual({ geometry: point, kind: 'geometry' });
		expect(location.lat).toBeCloseTo(47.61);
	});

	it('sends a drawn geometry as a location source off a stop', () => {
		const location = resolveActionLocation({ geometry: point, messages, stopGeometry: null });

		expect(location.locationSource).toEqual({ geometry: point, kind: 'geometry' });
	});

	it('requires a geometry on a stop whose geometry was cleared', () => {
		expect(() =>
			resolveActionLocation({ geometry: null, messages, stopGeometry: stopArea }),
		).toThrow('Place the point.');
	});

	it('requires a geometry off a stop', () => {
		expect(() => resolveActionLocation({ geometry: null, messages, stopGeometry: null })).toThrow(
			'Place the point.',
		);
	});

	it('reports an unreadable shape rather than dropping the location', () => {
		expect(() =>
			resolveActionLocation({
				geometry: { type: 'Nonsense', coordinates: [] },
				messages,
				stopGeometry: null,
			}),
		).toThrow('Unable to read that shape.');
	});
});
