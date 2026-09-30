/**
 * Every suite in this app runs with a `ResizeObserver` defined, because jsdom
 * ships none and the shared page parts need one.
 *
 * Since #1255 `Panel`, `SplitPage`, `RecordFormPage` and `ErrorReport` scroll
 * inside the shared `ScrollArea`, and Radix's scrollbar constructs an observer
 * on mount. A suite that renders any of them without one throws
 * `ResizeObserver is not defined`, and those parts sit under most of the
 * app's pages, so the install is a fact about the app rather than about any
 * one suite, which is `session-transport.ts`'s reasoning beside it.
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
