import { z } from 'zod';

/**
 * A record id a create form can open already filled in, carried in the URL.
 *
 * The counterpart of `mapPointSearchSchema`, which opens a form at a place.
 * This opens one against a parent: the habitat a control action was performed
 * at, the contact a service request came from, the address a trap is sited on.
 *
 * Search params rather than router state, for the reason the coordinate is one:
 * the prefilled form is then a link, so it survives a reload and can be sent to
 * somebody. `.catch(undefined)` because a hand-edited or truncated URL should
 * open an ordinary empty form rather than a route error, and an id that names
 * no record the reader can see resolves to an empty picker, not a broken one.
 *
 * A seed is not a link the server enforces. The form still holds the value as
 * an ordinary field the operator may change, and the command validates it on
 * the way out like any other reference.
 */
const seedId = z.uuid().optional().catch(undefined);

/** The habitat a record was worked at: a control action, a request. */
export const habitatSeedSearchSchema = z.object({ habitatId: seedId });

/** The address a record is sited on or was raised about. */
export const addressSeedSearchSchema = z.object({ addressId: seedId });

/** The contact a service request came from. */
export const contactSeedSearchSchema = z.object({ contactId: seedId });

/**
 * A seed as a form's defaults want it, with the absent ones dropped.
 *
 * `{ ...defaults, ...seededValues({ habitatId }) }` leaves `defaults.habitatId`
 * alone when nothing was seeded. Spreading the search object directly would set
 * the field to `undefined` instead, which is not the `null` these forms hold an
 * empty reference as, and a picker handed `undefined` reads as uncontrolled.
 */
export function seededValues<Seed extends Record<string, string | undefined>>(
	seed: Seed,
): Partial<{ [Key in keyof Seed]: string }> {
	return Object.fromEntries(
		Object.entries(seed).filter(([, value]) => value !== undefined),
	) as Partial<{ [Key in keyof Seed]: string }>;
}
