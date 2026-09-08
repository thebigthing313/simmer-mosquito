import { createIssues, throwIfIssues, validateLocalDate } from '../command-validation.js';
import type { ServiceRequestContextSettings } from './types-and-defaults.js';

/**
 * Meters per one unit of a distance unit, keyed by the `units.code` the org
 * setting stores. The `units` table carries no conversion factor, so this is
 * the canonical distance-unit → meters table. `mile` is the seeded default
 * unit; the rest cover the common distance units an organization might add. An
 * unrecognized code falls back to meters (factor 1) so a mis-set unit degrades
 * to a literal amount rather than throwing.
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
 *
 * Throws `DomainValidationError` when the request date is not a readable
 * calendar date, naming `requestDate` so the issue points at the field the
 * caller passed rather than at `addUtcDays`'s argument.
 */
export function serviceRequestContextBounds(
	requestDate: string,
	context: ServiceRequestContextSettings,
): ServiceRequestContextBounds {
	const datePart = validatedDatePart(
		requestDate,
		'requestDate',
		'Service request date is invalid.',
	);
	return {
		radiusMeters: distanceToMeters(context.radius.amount, context.radius.unitCode),
		dateFrom: shiftUtcDays(datePart, -context.timeWindow.daysBefore),
		dateTo: shiftUtcDays(datePart, context.timeWindow.daysAfter),
	};
}

/**
 * Add (or subtract) whole days to a `YYYY-MM-DD` date, returning `YYYY-MM-DD`.
 *
 * Throws `DomainValidationError` on a date it cannot read. It used to default
 * each part it could not parse, so an unreadable date and `1970-01-01` got the
 * same answer, and the caller ended up querying a window fifty years off the one
 * it asked for with nothing saying so (#681). That window returns no rows, which
 * on the nearby map reads as "nothing happened near this request".
 *
 * Throwing rather than #609's rule, which hands the value back and warns. That
 * rule is for a formatter, whose answer a person reads and can see is wrong; a
 * query bound is read by Postgres, which cannot, and a wrong one comes back as
 * an ordinary empty result. So the only place left to say it is the throw.
 *
 * The calendar check comes with reading the date properly: `2026-02-30` clears
 * the shape check and rolls forward to March 2, which is the same silent swap in
 * a date somebody typed rather than one that arrived broken.
 */
export function addUtcDays(date: string, days: number): string {
	return shiftUtcDays(validatedDatePart(date, 'date', 'Date is invalid.'), days);
}

/**
 * The `YYYY-MM-DD` a caller handed over, or a refusal naming the field it came
 * from.
 *
 * A timestamp is a date with more on the end, so the slice is what lets
 * `2026-07-23` and `2026-07-23T18:04:00.000Z` mean the same day, and it is the
 * whole of the tolerance: anything else is too short for the date shape.
 *
 * The `typeof` check is not redundant with the parameter type. What the one
 * caller anchors on is a column read back off a row, so `null` reaches here as
 * easily as a string does, and it used to arrive as a `TypeError` out of
 * `.slice`. It gets its own message, because "nothing arrived" and "what arrived
 * is not a date" send a reader to different places.
 */
function validatedDatePart(date: string, path: string, message: string): string {
	const issues = createIssues();
	if (typeof date !== 'string') {
		issues.push({ path, message: `${path} is missing.` });
		throwIfIssues(message, issues);
	}
	const datePart = date.slice(0, 10);
	validateLocalDate(datePart, path, issues);
	throwIfIssues(message, issues);
	return datePart;
}

/** Shift a date the validator has already read, in UTC so no zone can drift it. */
function shiftUtcDays(datePart: string, days: number): string {
	const shifted = new Date(Date.parse(`${datePart}T00:00:00.000Z`) + days * 86_400_000);
	const paddedYear = shifted.getUTCFullYear().toString().padStart(4, '0');
	const paddedMonth = (shifted.getUTCMonth() + 1).toString().padStart(2, '0');
	const paddedDay = shifted.getUTCDate().toString().padStart(2, '0');
	return `${paddedYear}-${paddedMonth}-${paddedDay}`;
}
