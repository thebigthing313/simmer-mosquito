/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type GeoJsonPointGeometry,
	NewAddressForm,
} from '../../../../components/pickers/new-address-form';

/**
 * "Use Manual Coordinates" hands the placement back to the caller's map and waits
 * for a click. The geocoder dialog is modal, so the order of those two steps is
 * the whole feature: close first and the click lands, close after and the overlay
 * eats the click the await is waiting for — a dialog that will not leave over a
 * map that will not respond.
 */

// jsdom ships none of the pointer APIs Radix reaches for. These assert behaviour,
// never geometry.
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

const GEOCODER_RESULTS = {
	results: [
		{
			formatted_address: '12 Marsh Rd, Edison NJ 08817',
			location: { lat: 40.52, lng: -74.41 },
		},
	],
};

/** A map request the test resolves by hand, standing in for the click. */
function pendingMapPoint() {
	let resolve!: (point: GeoJsonPointGeometry) => void;
	const promise = new Promise<GeoJsonPointGeometry>((settle) => {
		resolve = settle;
	});
	const requestMapPoint = vi.fn(() => promise);
	return { requestMapPoint, resolve };
}

function renderForm(requestMapPoint: () => Promise<GeoJsonPointGeometry>) {
	return render(
		<NewAddressForm
			initialSearch="12 Marsh Rd"
			onCancel={() => undefined}
			onCreated={() => undefined}
			requestMapPoint={requestMapPoint}
		/>,
	);
}

async function openGeocoderDialog(): Promise<void> {
	act(() => {
		screen.getByRole('button', { name: /geocode/i }).click();
	});
	await screen.findByRole('dialog');
}

describe('NewAddressForm — manual placement from the geocoder dialog', () => {
	beforeEach(() => {
		installDomStubs();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(GEOCODER_RESULTS), { status: 200 })),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		cleanup();
	});

	it('closes the dialog before waiting for the map click, not after', async () => {
		const { requestMapPoint, resolve } = pendingMapPoint();
		renderForm(requestMapPoint);
		await openGeocoderDialog();

		act(() => {
			screen.getByRole('button', { name: /use manual coordinates/i }).click();
		});

		// The click has not happened yet — the map request is still pending. The
		// dialog must already be gone, or that click can never reach the map.
		expect(requestMapPoint).toHaveBeenCalledOnce();
		await waitFor(() => {
			expect(screen.queryByRole('dialog')).toBeNull();
		});

		await act(async () => {
			resolve({ type: 'Point', coordinates: [-74.41, 40.52] });
		});
		expect(screen.getByText(/Point at/)).toBeTruthy();
	});

	it('stays quiet when the draw is cancelled rather than completed', async () => {
		let reject!: (error: Error) => void;
		const promise = new Promise<GeoJsonPointGeometry>((_, fail) => {
			reject = fail;
		});
		renderForm(() => promise);
		await openGeocoderDialog();

		act(() => {
			screen.getByRole('button', { name: /use manual coordinates/i }).click();
		});
		await act(async () => {
			reject(new Error('A new map request replaced this one.'));
		});

		// Calling off a draw is a decision, not a failure.
		expect(screen.queryByText(/A new map request replaced this one\./)).toBeNull();
		expect(screen.getByText('No address point selected.')).toBeTruthy();
	});
});
