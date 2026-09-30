/**
 * The layout and pointer APIs jsdom leaves out, installed once for every suite
 * in this package that runs under it.
 *
 * `Calendar` calls `scrollIntoView` on the focused day, and Radix's select,
 * menu and popover call the three pointer-capture methods on a pointer press.
 * The date picker suite used to stub the first itself (#1307).
 * `apps/web/src/tests/jsdom-shims.ts` is the same install for that app, plus
 * `matchMedia`, which no suite here reaches.
 *
 * Each stub does nothing and reports nothing. A suite that needs to see a call
 * installs its own with `vi.spyOn`, and `??=` leaves anything already defined
 * alone. A suite under the default `node` environment has no `Element`, so the
 * install is skipped there.
 */

if (typeof Element !== 'undefined') {
	Element.prototype.scrollIntoView ??= () => {};
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
}
