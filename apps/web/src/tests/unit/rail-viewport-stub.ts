/**
 * A height for the result rail's scroll viewport under jsdom, so a suite can
 * assert a whole list in one render.
 *
 * ## Why a rail mounts seven rows in a test
 *
 * `ResultRows` virtualises through `useVirtualizer`, which mounts the rows the
 * viewport shows plus `ROW_OVERSCAN` past each edge, and `ROW_OVERSCAN` is six.
 * `@tanstack/virtual-core` sizes the viewport by reading the scroll element's
 * `offsetHeight`, and sizes each mounted row by reading its `offsetHeight`
 * through `measureElement`. jsdom lays nothing out and answers zero for both,
 * and a zero-height viewport mounts nothing at all: `calculateRange` returns
 * `null` while the outer size is zero, and the rail draws an empty list. So a
 * rail suite has to give the viewport a height to see a row, and the one every
 * rail suite had was `stubPanelLayout`, which gives every element 700px. A
 * viewport of 700px over rows of 700px holds exactly one row, and the overscan
 * adds six: seven. A single render of eight rows drops the eighth, and before
 * #1115 the nearby link-destinations cases rendered one record kind per case
 * to stay under it. The issue put the seven down to the zero height itself,
 * and that is the half `rail-viewport-stub.test.tsx` measures the other way.
 *
 * ## What the stub does
 *
 * It answers both reads. The Radix viewport, the node `ResultRows` hands the
 * virtualiser as its scroll element, reports `px`; a row inside it, which is an
 * element carrying the virtualiser's own `data-index` attribute, reports
 * {@link STUB_ROW_HEIGHT}. Every other element keeps whatever `offsetHeight`
 * said before, so a suite that also runs `stubPanelLayout` keeps its 700 on the
 * panel. So `stubRailViewportHeight(n * STUB_ROW_HEIGHT)` mounts `n` rows plus
 * overscan, which is every row of a list of `n`. The height is in pixels rather
 * than rows because that is the question the virtualiser asks, and a reader who
 * has `STUB_ROW_HEIGHT` can write either.
 *
 * `initialRect` was the other route, reached through a prop on `ResultRows`
 * for tests to set. It was not taken because the virtualiser replaces it the
 * moment it observes the real element, which is the render after the viewport
 * mounts, so the stub would hold for one paint and a case would be asserting
 * over a race. Reading the element is what the library does, and stubbing the
 * read is what holds.
 *
 * ## What it does not do
 *
 * It installs no `ResizeObserver`. Radix's `ScrollArea` constructs one on
 * mount and jsdom has none, so a rail suite still installs a no-op or runs
 * `stubPanelLayout` beside this. Kept apart because the observer is what the
 * rail's other suites already stub, each for its own reason, and a second copy
 * inside this stub would be the one that drifted.
 *
 * It is a file of its own rather than an export of `router-harness.tsx`,
 * because that module imports the generated route tree and costs about 13
 * seconds, and a rail suite with no link in it should not pay that to get a
 * height.
 */

/**
 * What a row inside the stubbed viewport measures. It matches the estimate the
 * rail starts from, so the first paint and the measured one agree and a case
 * reads the same count on both.
 */
export const STUB_ROW_HEIGHT = 60;

const VIEWPORT_SELECTOR = '[data-slot="scroll-area-viewport"]';
const ROW_INDEX_ATTRIBUTE = 'data-index';

/**
 * Give the rail's scroll viewport `px` of height and each row in it
 * {@link STUB_ROW_HEIGHT}, until the returned function is called.
 *
 * Install it before the render and restore it after, per suite in a
 * `beforeAll`/`afterAll` pair or per case. The restore puts back the
 * `offsetHeight` that was there, so the stub layers over `stubPanelLayout` and
 * comes off without disturbing it.
 */
export function stubRailViewportHeight(px: number): () => void {
	const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
	const previousGet = previous?.get;

	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
		configurable: true,
		get(this: HTMLElement): number {
			if (this.matches(VIEWPORT_SELECTOR)) {
				return px;
			}
			if (this.hasAttribute(ROW_INDEX_ATTRIBUTE) && this.closest(VIEWPORT_SELECTOR) !== null) {
				return STUB_ROW_HEIGHT;
			}
			return previousGet === undefined ? 0 : (previousGet.call(this) as number);
		},
	});

	return () => {
		if (previous === undefined) {
			delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
			return;
		}
		Object.defineProperty(HTMLElement.prototype, 'offsetHeight', previous);
	};
}
