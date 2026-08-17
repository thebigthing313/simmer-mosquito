/**
 * What writing a performed control action involves, whichever one it is.
 *
 * Not a hook, so not a `use-` file. A chemical application, a biocontrol release,
 * a source reduction and an outreach action are four different records — they
 * measure different things and name different catalogs — but they are written
 * the same way, because they share the command shape the server gives them:
 * one create, one create-off-a-mission-stop, a field-details edit, a
 * location-and-context edit, and a delete.
 *
 * What is shared is the *reasoning about which command a save means*, which is
 * the part that is easy to get wrong and impossible to see when it is. What is
 * not shared is any table's columns: each hook maps its own, so a wrong column
 * name stays a compile error rather than becoming a lookup in a map.
 */

import type { ControlActionContext } from '@simmer-mosquito/domain';

/**
 * Where a performed action happened, as a form resolved it.
 *
 * The centroid and the instruction travel together because a save needs both:
 * the columns so the record's marker moves before the server answers, and the
 * instruction so the server can store the real shape. `lat`/`lng`/`geom_type`
 * are server-owned and stripped from the request — they exist only for the
 * optimistic row.
 */
export interface ActionLocation {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
	/**
	 * The instruction the server takes its geometry from. Absent on an edit that
	 * did not move the shape — absent means "leave it", which is not the same
	 * request as re-sending the shape it already has.
	 */
	readonly locationSource?: unknown;
}

/**
 * The larval context for an action, with the Inspection carried through.
 *
 * `contextIds` on the server maps a context onto *both* `habitat_id` and
 * `inspection_id`, so a context naming only the Habitat clears the Inspection the
 * action was recorded from. Whatever Inspection the record already has is passed
 * in and preserved; only the tables that have a `habitat_id` ever vary the first
 * argument.
 *
 * `{ kind: 'none' }` rather than an absent context when neither is set: the two
 * are different requests — one detaches the record, the other says nothing about
 * the attachment — so this is only ever called when the attachment is being
 * stated.
 */
export function contextFor(
	habitatId: string | null,
	inspectionId: string | null,
): ControlActionContext {
	if (habitatId === null && inspectionId === null) {
		return { kind: 'none' };
	}
	return {
		kind: 'larval',
		...(habitatId === null ? {} : { habitatId }),
		...(inspectionId === null ? {} : { inspectionId }),
	};
}

/**
 * Whether two custom-field bags differ.
 *
 * A structural comparison because `metadata` is arbitrary JSON the chosen
 * method's schema defines, so there are no known keys to compare one by one.
 * Both sides come from the same form and the same column, so key order is stable
 * enough for this to be an equality test rather than a heuristic.
 */
export function metadataChanged(before: unknown, after: unknown): boolean {
	return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}

/**
 * The commands one edit means.
 *
 * Every performed action splits its edit across two builders, and the server runs
 * only the ones named. The field-details command takes the measurements, the
 * date, the method, the technician and the custom fields; the
 * location-and-context command takes the drawn shape, the address, the larval
 * context and the requested action. Nothing reads both.
 *
 * So naming the wrong one loses work quietly: an address change sent under the
 * field-details name is dropped behind a 200, because that builder has no reader
 * for it. And naming one with nothing to change is refused outright, because the
 * domain will not run an empty command. Neither is a judgement call — it follows
 * from what actually moved, which is why this takes two booleans rather than a
 * form's opinion.
 *
 * An empty result means nothing moved and there is no write to make.
 */
export function actionEditIntents<TFields extends string, TPlacement extends string>(
	fieldsMoved: boolean,
	placementMoved: boolean,
	fieldsIntent: TFields,
	placementIntent: TPlacement,
): readonly (TFields | TPlacement)[] {
	return [...(fieldsMoved ? [fieldsIntent] : []), ...(placementMoved ? [placementIntent] : [])];
}
