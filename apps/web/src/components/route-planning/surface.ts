import type { RouteRow } from '@simmer-mosquito/sync';
import type { LinkProps } from '@tanstack/react-router';

/**
 * What differs between the two route-planning surfaces.
 *
 * A route is an ordered run field crews follow, and the pages that plan one are
 * the same page whether the run orders habitats or traps — the record type
 * changes what a stop *is*, not how the run is built. This is everything that
 * changes: where the pages live, what the stops are called, and which
 * `routeType` a new route is created with.
 *
 * Links are whole `LinkProps` rather than path strings so each destination is
 * type-checked where it is written, against the generated route tree, instead
 * of being widened to a string the shared page has to re-assert.
 */
export interface RoutePlanningSurface {
	/** The `routeType` a route created here is stored with. */
	readonly routeType: RouteRow['routeType'];
	/** Heading and back-link label, e.g. `Routes` or `Trap Routes`. */
	readonly title: string;
	/** Plural lowercase noun for the records a stop points at, for prose. */
	readonly stopNounPlural: string;
	/** Example name shown in the create dialog. */
	readonly namePlaceholder: string;
	readonly indexLink: LinkProps;
	readonly detailLink: (routeId: string) => LinkProps;
	readonly editLink: (routeId: string) => LinkProps;
}
