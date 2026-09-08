import { mapLifecycle } from '@simmer-mosquito/design-tokens';

/**
 * What each weather station status paints, and the only place it is written down.
 *
 * The key and the result rail import this rather than restating the colours.
 * DESIGN.md calls that the Legend Truth Rule: a hand-typed swatch drifted into
 * describing a colour that was not on the map and stayed wrong, because a legend
 * looks correct as long as it looks plausible.
 *
 * Stations come from a plain GeoJSON overlay rather than vector tiles, so the
 * colour rides on the feature and the paint expression reads it back. That is
 * why this is its own module and not part of a tile module: there is no weather
 * tile route, and there are tens of stations rather than thousands.
 */
export const WEATHER_STATION_STATUS_COLORS = {
	active: mapLifecycle.active,
	inactive: mapLifecycle.inactive,
} as const;
