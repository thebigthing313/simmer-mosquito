/**
 * Every suite in this package runs with a `ResizeObserver` defined, because
 * jsdom ships none and Radix constructs one on mount.
 *
 * `ScrollArea`'s scrollbar measures its viewport and the popper under
 * `DatePicker` measures on open, so `Panel`, `SplitPage`, `ErrorReport`, both
 * sidebars and the date picker all throw `ResizeObserver is not defined`
 * without one. Seven suites used to declare the same class for it (#1279).
 * `apps/web/src/tests/resize-observer.ts` is the same install for that app.
 *
 * The observer reports nothing. A suite that needs a size reported installs
 * its own with `vi.stubGlobal`, which replaces this one for that file, and
 * `??=` leaves any observer already defined alone.
 */

class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;
