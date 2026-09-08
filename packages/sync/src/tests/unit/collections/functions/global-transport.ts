/**
 * The transport a suite installs when what it wants to stub is the global.
 *
 * Since #694 `sessionFetch` refuses to send with no transport installed, so a
 * suite that reaches a write path through `vi.stubGlobal('fetch', ...)` has to
 * install one first. This is the smallest one that changes nothing else: it
 * reads `fetch` off the global at call time rather than closing over it, so
 * each case's own stub is still what answers.
 *
 * No app installs this. An app installs the transport that carries its
 * credential, which is the whole point of the refusal, and a suite asserting
 * over what a request carried installs its own mock instead.
 */
export const globalTransport: typeof fetch = (input, init) => fetch(input, init);
