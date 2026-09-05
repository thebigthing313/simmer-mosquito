import type { Map as MapboxMap } from 'mapbox-gl';

/**
 * Whether the key was the map's.
 *
 * A map session that answers Enter or Escape listens on `window`, because it
 * has to answer from the moment it opens and the page can take focus back off
 * the map under the user. That leaves it one question it cannot dodge: which
 * presses are its own. Five bugs were five answers to the other question,
 * "which presses are not the map's" — a field (#517), a spent default (#547), a
 * listbox item's role (#560), a focused `<button>` (#572, #573), and a
 * pointer-opened menu, which carries none of the first three and is
 * indistinguishable in the event from the canvas, itself a role-less element
 * nothing prevents a default on. So the rule here is the positive one. The key
 * is the map's when it came from the map's own key surface, and a press that
 * landed anywhere else on the page belongs to whatever it landed on.
 *
 * `getCanvasContainer`, not `getContainer`: mapbox's `_setupContainer` builds a
 * control container beside the canvas one, inside the same map, and puts its
 * attribution and info buttons in it. Those are the same `<button>` case #572
 * is, one element further in. The canvas container is also the element mapbox
 * binds its own `keydown` to, so arrow-key panning and `+`/`-` zoom already
 * require focus inside it, and this is the boundary the library itself draws.
 *
 * The second arm is the press nothing claimed. A keydown with no focused
 * element arrives on the body, which is what a browser hands a key when the
 * toolbar button that had focus has just re-rendered away. Read as "the target
 * is no element, or it is the body" rather than as an identity check against
 * `window`: under jsdom the global `window` is not the object a dispatch there
 * puts on `event.target`, and a rule that reads true in a browser and false in
 * every test is worse than no rule.
 *
 * Shared by {@link import('./use-map-draw').useMapDraw} and
 * {@link import('./use-map-measure').useMapMeasure}, which are siblings rather
 * than one built on the other, so it lives here instead of in either of them.
 */
export function isAimedAtMap(map: MapboxMap, target: EventTarget | null): boolean {
	if (target instanceof Node && map.getCanvasContainer().contains(target)) {
		return true;
	}
	return !(target instanceof Element) || target === target.ownerDocument.body;
}
