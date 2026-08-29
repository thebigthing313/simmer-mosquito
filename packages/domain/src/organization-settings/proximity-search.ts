/**
 * The distances a proximity search offers, in the agency's own units.
 *
 * A habitat merge starts from one habitat and asks what else is standing in the
 * same spot, so the first thing the user reads is a radius. Showing it in metres
 * to an agency that works in feet makes them convert before they can judge it,
 * and the conversion is the whole question: whether two records are the same
 * catch basin turns on whether ten metres is across the street or across the
 * kerb.
 *
 * The agency's `unitDefaults.distance` decides which system, not which unit. The
 * seeded default is `mile`, which is the right unit for driving to a site and
 * the wrong one for standing next to it, so this maps the system rather than
 * carrying the setting through.
 */

/** Which distance units a proximity search uses, and the radii it offers. */
export interface ProximitySearchUnit {
	/** A `units.code`, so `distanceToMeters` can convert an amount in it. */
	readonly unitCode: 'foot' | 'meter';
	/** What a distance is labelled with: `250 ft`, `100 m`. */
	readonly suffix: 'ft' | 'm';
	/** The radii offered, smallest first. The first is the default. */
	readonly steps: readonly number[];
}

/**
 * Distance unit codes that mean the agency works in feet and miles.
 *
 * Listed rather than derived, for the reason `METERS_PER_DISTANCE_UNIT` is: the
 * `units` table carries no system column, and a code is whatever an agency typed
 * when it added the unit. Anything unrecognized reads as metric, because that is
 * what the rest of the stack is in and a wrong guess there is a label rather
 * than a wrong number.
 */
const IMPERIAL_DISTANCE_CODES: ReadonlySet<string> = new Set([
	'mile',
	'miles',
	'mi',
	'yard',
	'yards',
	'yd',
	'foot',
	'feet',
	'ft',
	'inch',
	'inches',
	'in',
	'nautical_mile',
]);

const IMPERIAL: ProximitySearchUnit = {
	unitCode: 'foot',
	suffix: 'ft',
	// 250 ft is a little over a city lot, which is the distance two records for
	// one catch basin are usually apart. The rest widen to the block and past it,
	// for a set that was entered from two different streets.
	steps: [250, 500, 1000, 2500],
};

const METRIC: ProximitySearchUnit = {
	unitCode: 'meter',
	suffix: 'm',
	steps: [100, 250, 500, 1000],
};

/** Which units to search and label in, from the agency's default distance unit. */
export function proximitySearchUnit(distanceUnitCode: string): ProximitySearchUnit {
	return IMPERIAL_DISTANCE_CODES.has(distanceUnitCode.trim().toLowerCase()) ? IMPERIAL : METRIC;
}

/** `250 ft`, `1,000 m`. Grouped, because four digits of feet is common here. */
export function proximityLabel(amount: number, unit: ProximitySearchUnit): string {
	return `${amount.toLocaleString('en-US')} ${unit.suffix}`;
}
