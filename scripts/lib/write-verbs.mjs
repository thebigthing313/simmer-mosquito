/**
 * The verbs this app names a whole-page write flow with.
 *
 * A route whose last segment is one of these exists only to write: it is a
 * form, an importer, a merge or a cleanup tool, and never a page a person reads
 * and happens to be able to write from. `check-write-surfaces.mjs` classifies
 * routes by it and `check-nav-labels.mjs` classifies sidebar entries by it, so
 * the two gates answer "is this a write surface" the same way rather than
 * agreeing by hand.
 *
 * It lives here rather than in the older of the two gates because a second copy
 * is the register this whole family of gates exists to prevent. #623 is what a
 * fact written in two syntaxes costs: a floor was a `write:` field on a
 * navigation item and a role named inline in a route's `beforeLoad`, and the
 * two agreed on all 17 surfaces where both existed and said nothing on the
 * three where neither did.
 *
 * ## The floor is here too, and it throws
 *
 * A verb dropped from the list takes its routes and its sidebar entries out of
 * scope rather than reporting them, and each gate's summary line would still
 * read as a pass. That is #591's rule, and the refusal belongs beside the list
 * rather than in each reader: two readers checking a floor is two places to
 * stop checking it, and a third reader added later would owe a check nothing
 * makes it write.
 *
 * So the floor throws on import, which is `withheld-columns.mjs`'s shape. Every
 * reader gets the refusal, whatever it does with the list.
 */

/** The verbs, sorted, so a reader can see at a glance whether one is here. */
export const WRITE_VERBS = ['add-stop', 'cleanup', 'create', 'edit', 'import', 'merge'];

/** How few verbs means one has been dropped rather than the app having shrunk. */
const MINIMUM_WRITE_VERBS = 6;

if (WRITE_VERBS.length < MINIMUM_WRITE_VERBS) {
	throw new Error(
		`WRITE_VERBS holds ${WRITE_VERBS.length} of the ${MINIMUM_WRITE_VERBS} verbs this file expects. ` +
			'A dropped verb takes its routes and its sidebar entries out of every gate that reads ' +
			'this list, so both of them pass over the surfaces it named rather than reporting them. ' +
			'Put it back in scripts/lib/write-verbs.mjs, or, if this app genuinely no longer names a ' +
			'write flow that way, lower MINIMUM_WRITE_VERBS in the same commit and say why.',
	);
}

/**
 * Whether a path lands on a write surface.
 *
 * The last segment and not a suffix match, because `/gis/regions` would end in
 * no verb and `/operations/missions/$id/add-stop` ends in one that a substring
 * test would also find inside a route named `fast-op`.
 *
 * @param {string} path A route path or a navigation item's `to`.
 */
export const isWriteSurfacePath = (path) => WRITE_VERBS.includes(path.split('/').pop());
