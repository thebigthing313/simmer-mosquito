/**
 * The layout, pointer and media APIs jsdom leaves out, installed once for every
 * suite in this app that runs under it.
 *
 * Radix's select, menu and popover call `hasPointerCapture`,
 * `setPointerCapture` and `releasePointerCapture` on a pointer press, and a
 * listbox calls `scrollIntoView` to keep the highlighted option on screen.
 * `useMediaQuery` and `useIsMobile` in `packages/ui-web` read `matchMedia`,
 * which the sidebar and the navigation drawer call. Six suites and one shared
 * helper used to write the same stubs at the top of the file (#1307), and
 * `resize-observer.ts` beside this is the same move for the observer.
 *
 * Each stub does nothing and reports nothing: no pointer is ever captured and
 * no media query ever matches. A suite that needs to see a call, or a query
 * that matches, installs its own with `vi.spyOn` or `vi.stubGlobal`, and `??=`
 * leaves anything already defined alone. A suite under the default `node`
 * environment has no `Element`, so the install is skipped there.
 */

if (typeof Element !== 'undefined') {
	Element.prototype.scrollIntoView ??= () => {};
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
}

if (typeof window !== 'undefined') {
	window.matchMedia ??= ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
}
