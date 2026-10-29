/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoToCoordinatesDialog } from '../../../../components/map/go-to-coordinates-dialog';
import { FOCUS_PURPOSES } from '../../../../components/map/map-camera';
import type { LandingPin } from '../../../../hooks/map/use-landing-pin';
import { cleanupRenderedHooks, createFakeMap, type FakeMap } from './fake-map';

/**
 * The right-click menu's Go to coordinates dialog, driven on its own: the menu
 * opens through a trusted `contextmenu` that jsdom cannot dispatch, and what is
 * worth asserting is what the dialog does to the map once it is open.
 */

afterEach(() => {
	cleanup();
	cleanupRenderedHooks();
});

/** The dialog with its open state held, the way the menu holds it. */
function Harness({
	fake,
	pin = { drop: vi.fn(), clear: vi.fn() },
}: {
	readonly fake: FakeMap;
	readonly pin?: LandingPin;
}) {
	const [open, setOpen] = useState(true);
	return (
		<>
			<button onClick={() => setOpen(true)} type="button">
				Reopen
			</button>
			<GoToCoordinatesDialog map={fake.map} onOpenChange={setOpen} open={open} pin={pin} />
		</>
	);
}

function field(): HTMLInputElement {
	return screen.getByRole('textbox', { name: 'Coordinates' });
}

function submit(text: string) {
	fireEvent.change(field(), { target: { value: text } });
	fireEvent.click(screen.getByRole('button', { name: 'Go' }));
}

describe('Go to coordinates', () => {
	it('opens with the field focused and empty', () => {
		render(<Harness fake={createFakeMap()} />);

		expect(field().value).toBe('');
		expect(document.activeElement).toBe(field());
	});

	it('flies the map to a pasted coordinate and closes', () => {
		const fake = createFakeMap();
		render(<Harness fake={fake} />);

		submit('  40.123456, -74.123456 ');

		expect(fake.cameraCalls).toEqual([
			expect.objectContaining({
				kind: 'flyTo',
				center: [-74.123456, 40.123456],
				zoom: FOCUS_PURPOSES.place.zoomFloor,
				duration: FOCUS_PURPOSES.place.duration,
			}),
		]);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('drops the landing pin on the coordinate, named by it', () => {
		const pin = { drop: vi.fn(), clear: vi.fn() };
		render(<Harness fake={createFakeMap()} pin={pin} />);

		submit('40.5 -74.25');

		expect(pin.drop).toHaveBeenCalledExactlyOnceWith(
			{ lng: -74.25, lat: 40.5 },
			'Coordinates 40.500000, -74.250000',
		);
	});

	it('drops no pin for a coordinate it refuses', () => {
		const pin = { drop: vi.fn(), clear: vi.fn() };
		render(<Harness fake={createFakeMap()} pin={pin} />);

		submit('91, 0');

		expect(pin.drop).not.toHaveBeenCalled();
	});

	it('takes a pair split by spaces alone', () => {
		const fake = createFakeMap();
		render(<Harness fake={fake} />);

		submit('40.5 -74.5');

		expect(fake.cameraCalls.map((call) => call.center)).toEqual([[-74.5, 40.5]]);
	});

	it('keeps a closer view than the place zoom floor', () => {
		const fake = createFakeMap();
		fake.setZoom(18);
		render(<Harness fake={fake} />);

		submit('40.5, -74.5');

		expect(fake.cameraCalls[0]?.zoom).toBe(18);
	});

	it('keeps the dialog and the text when the input does not read', () => {
		const fake = createFakeMap();
		render(<Harness fake={fake} />);

		submit('forty, seventy');

		expect(screen.getByRole('dialog')).not.toBeNull();
		expect(field().value).toBe('forty, seventy');
		expect(field().getAttribute('aria-invalid')).toBe('true');
		expect(screen.getByRole('alert').textContent).toBe(
			'Enter a latitude and longitude, like 40.123456, -74.123456.',
		);
		expect(fake.cameraCalls).toEqual([]);
	});

	it('refuses a latitude or longitude out of range', () => {
		const fake = createFakeMap();
		render(<Harness fake={fake} />);

		submit('-118.2437, 34.0522');

		expect(field().value).toBe('-118.2437, 34.0522');
		expect(screen.getByRole('alert').textContent).toBe(
			'Latitude must be between -90 and 90, and longitude between -180 and 180.',
		);
		expect(fake.cameraCalls).toEqual([]);
	});

	it('clears the error once the text changes', () => {
		render(<Harness fake={createFakeMap()} />);

		submit('nowhere');
		fireEvent.change(field(), { target: { value: '40' } });

		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('opens empty again after a refusal and a cancel', () => {
		render(<Harness fake={createFakeMap()} />);

		submit('nowhere');
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('dialog')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
		expect(field().value).toBe('');
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
