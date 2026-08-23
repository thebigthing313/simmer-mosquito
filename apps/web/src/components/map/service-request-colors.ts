import { mapStatus } from '@simmer-mosquito/design-tokens';

/**
 * What each service-request state paints, and the only place it is written down.
 *
 * A request is open or it is closed, and the two are the same pair every other
 * surface draws: red for the ones still asking for work, and the resolved tone
 * for the ones that are done. Kept as literals, like every other map colour: GL
 * paint can't read CSS custom props.
 *
 * These points come from a plain GeoJSON overlay rather than vector tiles, so
 * the colour rides on the feature and the paint expression reads it back.
 */
export const SERVICE_REQUEST_STATUS_COLORS = {
	open: mapStatus.problem,
	closed: mapStatus.resolved,
} as const;
