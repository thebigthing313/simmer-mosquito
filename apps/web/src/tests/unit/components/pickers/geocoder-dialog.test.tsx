/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	GeocoderDialog,
	type GeocoderResult,
	geocoderPointSummary,
	geocoderResultCoordinates,
	geocoderResultKey,
	pointFromGeocoderResult,
} from '../../../../components/pickers/geocoder-dialog';

/**
 * The dialog is now one component behind two address forms, and this is the
 * file that keeps it that way.
 *
 * `new-address-form.test.tsx` covers the ordering bug (#80) end to end through
 * the inline subform, which is where it happened. What it cannot cover is the
 * seam: the two callers differ in exactly one prop, `onUseManualCoordinates`,
 * present for the standalone GIS form (it has a map) and absent for the
 * subform (embedded in a plain record form, it has none). That fork is what a
 * future divergence would have to go through, so it is asserted here rather
 * than through either caller.
 */

function installDomStubs(): void {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView ??= () => {};
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
}

const RESULT: GeocoderResult = {
	formatted_address: '12 Marsh Rd, Edison NJ 08817',
	location: { lat: 40.52, lng: -74.41 },
};

describe('GeocoderDialog', () => {
	beforeEach(installDomStubs);
	afterEach(cleanup);

	it('offers manual placement, and says so, only when the caller has a map', async () => {
		const { rerender } = render(
			<GeocoderDialog
				onOpenChange={() => undefined}
				onSelect={() => undefined}
				open
				results={[RESULT]}
			/>,
		);

		expect(screen.queryByRole('button', { name: /use manual coordinates/i })).toBeNull();
		expect(screen.getByText('Select the best match for this address.')).toBeTruthy();

		rerender(
			<GeocoderDialog
				onOpenChange={() => undefined}
				onSelect={() => undefined}
				onUseManualCoordinates={() => undefined}
				open
				results={[RESULT]}
			/>,
		);

		expect(screen.getByRole('button', { name: /use manual coordinates/i })).toBeTruthy();
		expect(
			screen.getByText('Select the best match or place the address point manually on the map.'),
		).toBeTruthy();
	});

	it('hands the chosen result back', () => {
		const onSelect = vi.fn();
		render(
			<GeocoderDialog onOpenChange={() => undefined} onSelect={onSelect} open results={[RESULT]} />,
		);

		act(() => {
			screen.getByRole('button', { name: /12 Marsh Rd/ }).click();
		});

		expect(onSelect).toHaveBeenCalledWith(RESULT);
	});

	it('says so plainly when the geocoder matched nothing', () => {
		render(
			<GeocoderDialog
				onOpenChange={() => undefined}
				onSelect={() => undefined}
				open
				results={[]}
			/>,
		);

		expect(screen.getByText('No geocoder results returned.')).toBeTruthy();
	});
});

describe('geocoder result helpers', () => {
	// `[lng, lat]`, the GeoJSON order — the geocoder answers in `{lat, lng}`, and
	// swapping them puts every address in the wrong hemisphere silently.
	it('reads a result into a GeoJSON point in longitude-latitude order', () => {
		expect(pointFromGeocoderResult(RESULT)).toEqual({
			type: 'Point',
			coordinates: [-74.41, 40.52],
		});
	});

	it('treats a result with no usable location as having none', () => {
		expect(pointFromGeocoderResult({ formatted_address: 'Somewhere' })).toBeNull();
		expect(pointFromGeocoderResult({ location: { lat: 40.52 } })).toBeNull();
		expect(geocoderResultCoordinates({ formatted_address: 'Somewhere' })).toBe('No coordinates');
	});

	// Latitude first, the order a human reads coordinates in, and the reverse of
	// how they are stored.
	it('summarises a point latitude-first at five decimals', () => {
		expect(geocoderPointSummary({ type: 'Point', coordinates: [-74.41, 40.52] })).toBe(
			'40.52000, -74.41000',
		);
	});

	it('keys two results at the same address by their coordinates', () => {
		const other: GeocoderResult = { ...RESULT, location: { lat: 40.53, lng: -74.41 } };

		expect(geocoderResultKey(RESULT)).not.toBe(geocoderResultKey(other));
	});
});
