import type { LngLat } from './geometry.js';

/** How a coordinate reads in the UI and on the clipboard: `lat, lng`, six places. */
export function formatLatLng(lat: number, lng: number): string {
	return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * What reading a typed coordinate gave: the point, or why there is none.
 * `unreadable` is text that is not two decimal numbers; `out-of-range` is two
 * numbers that are not a place on Earth.
 */
export type ParsedLatLng =
	| { readonly ok: true; readonly point: LngLat }
	| { readonly ok: false; readonly reason: 'unreadable' | 'out-of-range' };

/** A plain decimal: an optional sign, digits, an optional fraction. No exponent. */
const DECIMAL = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;

/** Two decimals split by a comma, by spaces, or by both. */
const LAT_LNG = new RegExp(String.raw`^(${DECIMAL})(?:\s*,\s*|\s+)(${DECIMAL})$`);

/**
 * Read a coordinate typed or pasted as decimal degrees, latitude first.
 *
 * It takes what {@link formatLatLng} writes, `40.123456, -74.123456`, and the
 * same pair split by spaces alone. Whitespace around the pair is ignored.
 */
export function parseLatLng(text: string): ParsedLatLng {
	const match = LAT_LNG.exec(text.trim());
	if (match === null) {
		return { ok: false, reason: 'unreadable' };
	}
	const lat = Number(match[1]);
	const lng = Number(match[2]);
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
		return { ok: false, reason: 'out-of-range' };
	}
	return { ok: true, point: { lng, lat } };
}
