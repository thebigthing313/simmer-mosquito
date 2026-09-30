/**
 * What the three refusal suites under operations share: the state their mocks
 * close over, the bodies of the three mocks every one of them declares, the
 * render and the reset, and the steps that drive a `DetailPageHeader`'s `...`,
 * which the mission and assignment suites both take.
 *
 * Not a suite. `request-detail-refusal.test.tsx` and
 * `assignment-run-refusal.test.tsx` each wrote this block out, and
 * `mission-run-refusal.test.tsx` (#1131) was the third copy by the time #1132
 * was read. The `vi.mock` calls stay in each suite, because `vi.mock` hoists
 * per file and a mock declared in an imported module registers for nothing;
 * what a factory hands back is an ordinary function a factory can `import()`,
 * which is `explorer-route-harness.tsx`'s pattern. The mocks for the page's
 * own hooks, its mutation recorder and its layout stubs stay in the suite that
 * needs them, and each records its writes through {@link lifecycleWrite} so
 * the refusal a case chooses is one setting.
 *
 * One factory may not reach this module: the `@simmer-mosquito/sync` stand-in
 * in the request suite. This module seeds the Organization row, so it imports
 * the organizations collection, which imports `@simmer-mosquito/sync`, and a
 * `sync` factory that awaited this module would wait on itself until the
 * watchdog in `vitest.shared.ts` named the file (#663). That factory reads the
 * record id off the URL it is handed instead. The three factories that do
 * import this module, `sonner`, the router and the auth snapshot, are safe
 * because nothing this module imports reaches any of the three.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { expect, type Mock, vi } from 'vitest';
import { organizations } from '../../../../lib/collections/organizations';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { routerStandIn, signedInSnapshotAs } from '../route-mock-stand-ins';

/**
 * The Organization every page is rendered under, which is the row the reset
 * seeds and the id the auth snapshot carries.
 */
export const ORGANIZATION_ID = 'org-1';

/**
 * What the mocks close over. A suite sets `refusal` before it presses, and
 * reads `writes` and `toastError` after. `params` is read by the router
 * stand-in as a store snapshot, so it is one object for the life of the file
 * and the record a suite builds takes its id from it.
 */
export const refusalHarness: {
	params: Record<string, string>;
	role: SimmerRole;
	/** What the server answers the next lifecycle write with; `null` is a success. */
	refusal: Error | string | null;
	/** Every lifecycle write the page asked for, in order. */
	writes: string[];
	/** What `toast.error` was handed. */
	toastError: Mock<(message: string) => void>;
} = {
	params: { id: 'record-1' },
	role: 'manager',
	refusal: null,
	writes: [],
	toastError: vi.fn(),
};

/** The body of `vi.mock('sonner')`: an error toast that records its sentence. */
export function sonnerStandIn() {
	return {
		toast: { error: (message: string) => refusalHarness.toastError(message) },
	};
}

/** The body of `vi.mock('@tanstack/react-router')`: no search, and the harness's params. */
export function refusalRouterStandIn<TActual extends object>(actual: TActual): TActual {
	return routerStandIn(
		actual,
		() => ({}),
		() => refusalHarness.params,
	);
}

/** The body of `vi.mock` over `use-auth-snapshot`: signed in as the harness's role. */
export function authSnapshotStandIn() {
	return { useAuthSnapshot: () => signedInSnapshotAs(refusalHarness.role, ORGANIZATION_ID) };
}

/**
 * One lifecycle action of a mutation recorder: it records `kind` and then
 * throws the refusal the case chose, or resolves when there is none.
 */
export function lifecycleWrite(kind: string): () => Promise<void> {
	return async () => {
		refusalHarness.writes.push(kind);
		if (refusalHarness.refusal !== null) {
			throw refusalHarness.refusal;
		}
	};
}

/**
 * A refusal a confirmation can answer: the `acknowledgement_required` body the
 * delete registry sends, naming `flag`. Set as `refusal`, it is what
 * `useAcknowledgedWrite` turns into its dialog rather than a toast.
 */
export function acknowledgementRefusal(flag: string): Error {
	return Object.assign(new Error('Acknowledgement required.'), {
		body: { error: 'acknowledgement_required', flag },
	});
}

/** The `beforeEach`: fresh collections with the Organization seeded, and every setting back to its default. */
export function resetRefusalHarness(): void {
	installMemoryCollections();
	seedRows(organizations, [{ id: ORGANIZATION_ID, name: 'Test Mosquito Control', settings: {} }]);
	refusalHarness.role = 'manager';
	refusalHarness.refusal = null;
	refusalHarness.writes.length = 0;
	refusalHarness.toastError.mockReset();
}

/**
 * What {@link renderRefusalPage} waits for. A string is the page's `<h1>`,
 * which is when the record is on screen. `{ text }` is any element reading
 * exactly that, for a state with no `<h1>`: a not-found page draws its title
 * in `EmptyTitle`, which is a `div`, so a wait on a heading would never end.
 */
export type RefusalPageReady = string | { readonly text: string };

/**
 * The preloaded route component under a fresh query client, waited for until
 * `ready` is on screen.
 */
export async function renderRefusalPage(
	Page: () => ReactNode,
	ready: RefusalPageReady,
): Promise<void> {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<Suspense fallback={<span>loading</span>}>
					<Page />
				</Suspense>
			</TooltipProvider>
		</QueryClientProvider>,
	);
	if (typeof ready === 'string') {
		await screen.findByRole('heading', { level: 1, name: ready });
	} else {
		await screen.findByText(ready.text);
	}
}

/** Open a `DetailPageHeader`'s `...` and read what it holds, in order. */
export async function openMenu(): Promise<readonly string[]> {
	fireEvent.pointerDown(
		screen.getByRole('button', { name: 'More Actions' }),
		new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
	);
	await screen.findAllByRole('menuitem');
	return screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
}

/**
 * Choose an item from the `...` and let the write settle, so the busy flag
 * clears inside `act`. Radix selects on the pointer-up half of a click and on
 * a key, and the key is the one jsdom can deliver whole.
 */
export async function choose(name: string): Promise<void> {
	await openMenu();
	const item = screen.getByRole('menuitem', { name });
	expect(item.getAttribute('aria-disabled')).toBeNull();
	await act(async () => {
		fireEvent.keyDown(item, { key: 'Enter' });
	});
}

/**
 * Choose an item that opens a `ReasonDialog`, then its confirm. The confirm is
 * found rather than pressed straight away, because the dialog mounts its
 * content on open.
 */
export async function chooseThroughDialog(name: string, confirmLabel: string): Promise<void> {
	await choose(name);
	const confirm = await screen.findByRole('button', { name: confirmLabel });
	expect((confirm as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
}

/**
 * Choose the header's Delete item and confirm the dialog it opens, whose
 * heading names the record and whose confirm names its type.
 */
export async function chooseDelete(
	item: string,
	heading: string,
	confirmLabel: string,
): Promise<void> {
	await choose(item);
	expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
	const confirm = await screen.findByRole('button', { name: confirmLabel });
	await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
	await act(async () => {
		fireEvent.click(confirm);
	});
}

/** The two halves of the rule: the toast says `message`, and nothing on the page does. */
export async function expectRefusalToast(message: string): Promise<void> {
	await waitFor(() => expect(refusalHarness.toastError).toHaveBeenCalledWith(message));
	expect(refusalHarness.toastError).toHaveBeenCalledTimes(1);
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.queryByText(message)).toBeNull();
}
