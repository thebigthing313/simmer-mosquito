import type { ServiceRequestContextSettings } from './types-and-defaults.js';

/**
 * Meters per one unit of a distance unit, keyed by the `units.code` the org
 * setting stores. The `units` table carries no conversion factor, so this is the
 * canonical distance-unit → meters table. `mile` is the seeded default unit; the
 * rest cover the common distance units an agency might add. An unrecognized code
 * falls back to meters (factor 1) so a mis-set unit degrades to a literal amount
 * rather than throwing.
 */
const METERS_PER_DISTANCE_UNIT: Readonly<Record<string, number>> = {
	mile: 1609.344,
	miles: 1609.344,
	mi: 1609.344,
	kilometer: 1000,
	kilometre: 1000,
	km: 1000,
	meter: 1,
	metre: 1,
	m: 1,
	yard: 0.9144,
	yd: 0.9144,
	foot: 0.3048,
	feet: 0.3048,
	ft: 0.3048,
	nautical_mile: 1852,
};

/** Convert an amount in the given distance unit (a `units.code`) to meters. */
export function distanceToMeters(amount: number, unitCode: string): number {
	const factor = METERS_PER_DISTANCE_UNIT[unitCode.trim().toLowerCase()] ?? 1;
	return amount * factor;
}

export interface ServiceRequestContextBounds {
	readonly radiusMeters: number;
	/** Inclusive lower bound, `YYYY-MM-DD`. */
	readonly dateFrom: string;
	/** Inclusive upper bound, `YYYY-MM-DD`. */
	readonly dateTo: string;
}

/**
 * Resolve the concrete proximity + time-window bounds a nearby query needs from
 * the org's service-request context setting, anchored on a request's date:
 * radius → meters, and timeWindow → an inclusive
 * `[requestDate - daysBefore, requestDate + daysAfter]` date range. Date math is
 * UTC so it never drifts a day at a timezone boundary.
 */
export function serviceRequestContextBounds(
	requestDate: string,
	context: ServiceRequestContextSettings,
): ServiceRequestContextBounds {
	return {
		radiusMeters: distanceToMeters(context.radius.amount, context.radius.unitCode),
		dateFrom: addUtcDays(requestDate, -context.timeWindow.daysBefore),
		dateTo: addUtcDays(requestDate, context.timeWindow.daysAfter),
	};
}

/** Add (or subtract) whole days to a `YYYY-MM-DD` date, returning `YYYY-MM-DD`. */
export function addUtcDays(date: string, days: number): string {
	const [year, month, day] = date.slice(0, 10).split('-').map(Number);
	const base = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
	const shifted = new Date(base + days * 86_400_000);
	const paddedYear = shifted.getUTCFullYear().toString().padStart(4, '0');
	const paddedMonth = (shifted.getUTCMonth() + 1).toString().padStart(2, '0');
	const paddedDay = shifted.getUTCDate().toString().padStart(2, '0');
	return `${paddedYear}-${paddedMonth}-${paddedDay}`;
}
