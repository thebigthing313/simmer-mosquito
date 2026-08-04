/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { act, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeciesKeyBindingsView } from '../../hooks/use-species-key-bindings';
import { KeyEntryDialog } from './key-entry-dialog';
import type { TallyEntry } from './use-key-entry-tally';

/**
 * The dialog's orchestration — the idle-flush timer, overlapping commits, and the
 * close paths — is where every bug in this feature has lived, and none of it is
 * reachable from the pure planner/tally tests. These drive the real component with a
 * controllable clock and a stubbed `onCommit` so a write can be held mid-flight.
 */

const AUTO_SAVE_KEY = 'simmer.key-entry.auto-save';
const AEGYPTI = 'species-aegypti';

const BINDING = { key: 'a', speciesId: AEGYPTI, speciesName: 'Aedes aegypti' };

const BINDINGS: SpeciesKeyBindingsView = {
	bindings: [BINDING],
	byKey: new Map([['a', BINDING]]),
	keyBySpeciesId: new Map([[AEGYPTI, 'a']]),
	hasBindings: true,
};

// jsdom ships none of the layout/pointer APIs Radix reaches for. Stubs are enough:
// these tests assert behaviour, never geometry.
function installDomStubs(): void {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView ??= () => {};
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
	globalThis.matchMedia ??= ((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof matchMedia;
}

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolveFn, rejectFn) => {
		resolve = resolveFn;
		reject = rejectFn;
	});
	// An unhandled rejection here would fail the run before the component catches it.
	promise.catch(() => undefined);
	return { promise, resolve, reject };
}

/** Holds `open` the way a real page does, so the dialog can actually close itself. */
function Harness({
	onCommit,
	onClosed,
}: {
	readonly onCommit: (entries: readonly TallyEntry[]) => Promise<void>;
	readonly onClosed: () => void;
}) {
	const [open, setOpen] = useState(true);
	return (
		<KeyEntryDialog
			bindings={BINDINGS}
			countLabel="larvae"
			description="Press a species key."
			mode={null}
			onCommit={onCommit}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					onClosed();
				}
			}}
			open={open}
			title="Key entry"
		/>
	);
}

function renderDialog(onCommit: (entries: readonly TallyEntry[]) => Promise<void>) {
	const onClosed = vi.fn();
	render(<Harness onClosed={onClosed} onCommit={onCommit} />);
	return { onClosed };
}

function dialog(): HTMLElement {
	return screen.getByRole('dialog');
}

/** Presses land on the dialog's capture handler, the same path a real key takes. */
function press(key: string, times = 1): void {
	const target = dialog();
	for (let index = 0; index < times; index += 1) {
		act(() => {
			target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
		});
	}
}

/** Run the clock forward, flushing the promises each timer callback kicks off. */
async function advance(ms: number): Promise<void> {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

/** Let in-flight promises settle without moving the clock. */
async function settle(): Promise<void> {
	await act(async () => {
		await Promise.resolve();
	});
}

function setAutoSave(enabled: boolean): void {
	globalThis.localStorage.setItem(AUTO_SAVE_KEY, String(enabled));
}

function countsOf(entries: readonly TallyEntry[]): readonly (readonly [string, number])[] {
	return entries.map((entry) => [entry.speciesId, entry.count] as const);
}

type CommitMock = ReturnType<typeof vi.fn>;

/** The entries handed to the nth commit, failing loudly if it never happened. */
function commitEntries(onCommit: CommitMock, index: number): readonly TallyEntry[] {
	const call = onCommit.mock.calls.at(index);
	if (call === undefined) {
		throw new Error(`expected a commit at index ${index}, saw ${onCommit.mock.calls.length}`);
	}
	return call[0] as readonly TallyEntry[];
}

/** Species/count pairs of the nth commit — what the tally actually asked to persist. */
function commitCounts(onCommit: CommitMock, index: number): readonly (readonly [string, number])[] {
	return countsOf(commitEntries(onCommit, index));
}

beforeEach(() => {
	installDomStubs();
	vi.useFakeTimers();
	globalThis.localStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('key entry dialog — auto-save', () => {
	it('coalesces a burst into one commit carrying the whole tally', async () => {
		setAutoSave(true);
		const onCommit = vi.fn().mockResolvedValue(undefined);
		renderDialog(onCommit);

		press('a', 4);
		expect(onCommit).not.toHaveBeenCalled();

		await advance(700);

		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(commitCounts(onCommit, 0)).toEqual([[AEGYPTI, 4]]);
	});

	/**
	 * Regression: the idle timer fired while an explicit save was awaiting its writes,
	 * so both planned from the same pre-write state and inserted the same row twice.
	 */
	it('does not commit twice when a burst is followed straight by Enter', async () => {
		setAutoSave(true);
		const gate = deferred();
		const onCommit = vi.fn().mockReturnValue(gate.promise);
		renderDialog(onCommit);

		press('a', 3);
		press('Enter');
		await settle();

		expect(onCommit).toHaveBeenCalledTimes(1);

		// The idle flush would have fired in here, while the save was still in flight.
		await advance(2000);
		expect(onCommit).toHaveBeenCalledTimes(1);

		gate.resolve();
		await advance(2000);

		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(commitCounts(onCommit, 0)).toEqual([[AEGYPTI, 3]]);
	});

	it('never runs two commits at once when a slow flush overlaps the next one', async () => {
		setAutoSave(true);
		const first = deferred();
		let inFlight = 0;
		let maxInFlight = 0;
		const onCommit = vi.fn(async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			try {
				await (onCommit.mock.calls.length === 1 ? first.promise : Promise.resolve());
			} finally {
				inFlight -= 1;
			}
		});
		renderDialog(onCommit);

		press('a');
		await advance(700);

		// More presses while the first write is still open.
		press('a', 2);
		await advance(700);

		first.resolve();
		await advance(700);

		expect(maxInFlight).toBe(1);
		// The last commit carries the full tally, not a delta.
		expect(commitCounts(onCommit, -1)).toEqual([[AEGYPTI, 3]]);
	});

	/**
	 * Regression: an emptied tally read as "nothing to do", so undoing everything left
	 * the flushed rows in place — the change persisted even though the tally was clear.
	 */
	it('commits an emptied tally so a full undo takes the rows back', async () => {
		setAutoSave(true);
		const onCommit = vi.fn().mockResolvedValue(undefined);
		renderDialog(onCommit);

		press('a');
		await advance(700);
		expect(commitCounts(onCommit, 0)).toEqual([[AEGYPTI, 1]]);

		press('Backspace');
		await advance(700);

		expect(onCommit).toHaveBeenCalledTimes(2);
		expect(commitEntries(onCommit, 1)).toEqual([]);
	});

	it('skips a redundant commit when nothing moved since the last one', async () => {
		setAutoSave(true);
		const onCommit = vi.fn().mockResolvedValue(undefined);
		renderDialog(onCommit);

		press('a');
		await advance(700);
		expect(onCommit).toHaveBeenCalledTimes(1);

		// Idle with an unchanged tally: no second write.
		await advance(5000);
		expect(onCommit).toHaveBeenCalledTimes(1);
	});
});

describe('key entry dialog — closing', () => {
	/**
	 * Regression: a failing auto-save returned early from the close path, leaving no
	 * way out of the modal — Escape, the X, and Done all did nothing.
	 */
	it('lets the user out after a failed save instead of trapping them', async () => {
		setAutoSave(true);
		const onCommit = vi.fn().mockRejectedValue(new Error('write rejected'));
		const { onClosed } = renderDialog(onCommit);

		press('a');
		await advance(700);
		// getBy, not findBy: findBy polls on real timers, which never move here.
		expect(screen.getByText('write rejected')).toBeDefined();

		press('Escape');
		await settle();
		expect(onClosed).not.toHaveBeenCalled();
		expect(screen.getByText(/close again to discard/i)).toBeDefined();

		press('Escape');
		await settle();
		expect(onClosed).toHaveBeenCalledTimes(1);
	});

	it('warns once before discarding an unsaved tally in explicit-save mode', async () => {
		setAutoSave(false);
		const onCommit = vi.fn().mockResolvedValue(undefined);
		const { onClosed } = renderDialog(onCommit);

		press('a', 2);
		await advance(2000);
		// Explicit mode writes nothing on its own.
		expect(onCommit).not.toHaveBeenCalled();

		press('Escape');
		await settle();
		expect(onClosed).not.toHaveBeenCalled();
		expect(screen.getByText(/2 unsaved/i)).toBeDefined();

		press('Escape');
		await settle();
		expect(onClosed).toHaveBeenCalledTimes(1);
		expect(onCommit).not.toHaveBeenCalled();
	});

	it('closes straight away when there is nothing to save', async () => {
		setAutoSave(false);
		const onCommit = vi.fn().mockResolvedValue(undefined);
		const { onClosed } = renderDialog(onCommit);

		press('Escape');
		await settle();

		expect(onClosed).toHaveBeenCalledTimes(1);
		expect(onCommit).not.toHaveBeenCalled();
	});
});

describe('key entry dialog — presses', () => {
	it('ignores a key with no binding', async () => {
		setAutoSave(true);
		const onCommit = vi.fn().mockResolvedValue(undefined);
		renderDialog(onCommit);

		press('z');
		await advance(700);

		expect(onCommit).not.toHaveBeenCalled();
		expect(screen.getByText(/not bound to a species/i)).toBeDefined();
	});

	it('leaves modifier combinations to the browser', async () => {
		setAutoSave(true);
		const onCommit = vi.fn().mockResolvedValue(undefined);
		renderDialog(onCommit);

		act(() => {
			dialog().dispatchEvent(
				new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
			);
		});
		await advance(700);

		expect(onCommit).not.toHaveBeenCalled();
	});
});
