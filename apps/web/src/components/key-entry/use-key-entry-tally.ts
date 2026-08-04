import { useCallback, useMemo, useState } from 'react';

/**
 * One line of the running tally. The variant distinguishes lines that share a species
 * but differ by adult sex/status; larval entry passes {@link NO_VARIANT}.
 */
export interface TallyEntry {
	readonly entryKey: string;
	readonly speciesId: string;
	readonly variant: TallyVariant;
	readonly count: number;
}

/** Adult identification splits a species by sex and physiological status. */
export interface TallyVariant {
	readonly sex: string | null;
	readonly status: string | null;
}

export const NO_VARIANT: TallyVariant = { sex: null, status: null };

export function entryKeyFor(speciesId: string, variant: TallyVariant): string {
	return `${speciesId}|${variant.sex ?? ''}|${variant.status ?? ''}`;
}

export interface TallyState {
	readonly counts: ReadonlyMap<string, TallyEntry>;
	/** Every press in order, so Backspace retracts exactly the last one. */
	readonly history: readonly string[];
	/** Touch order, newest first, so the tally list reads as a running log. */
	readonly recency: readonly string[];
}

export const EMPTY_TALLY_STATE: TallyState = {
	counts: new Map(),
	history: [],
	recency: [],
};

// --- reducers (pure, so the entry rules can be tested without a renderer) -----

export function applyPress(
	state: TallyState,
	speciesId: string,
	variant: TallyVariant,
): TallyState {
	const entryKey = entryKeyFor(speciesId, variant);
	const counts = new Map(state.counts);
	const existing = counts.get(entryKey);
	counts.set(entryKey, {
		entryKey,
		speciesId,
		variant,
		count: (existing?.count ?? 0) + 1,
	});
	return {
		counts,
		history: [...state.history, entryKey],
		recency: [entryKey, ...state.recency.filter((key) => key !== entryKey)],
	};
}

export function applyUndo(state: TallyState): TallyState {
	const entryKey = state.history.at(-1);
	if (entryKey === undefined) {
		return state;
	}
	const history = state.history.slice(0, -1);
	const existing = state.counts.get(entryKey);
	if (existing === undefined) {
		return { ...state, history };
	}

	const counts = new Map(state.counts);
	if (existing.count <= 1) {
		counts.delete(entryKey);
	} else {
		counts.set(entryKey, { ...existing, count: existing.count - 1 });
	}

	return {
		counts,
		history,
		// A retracted line stays visible while it still holds a count; once it is
		// empty it drops out of the log entirely.
		recency: counts.has(entryKey) ? state.recency : state.recency.filter((key) => key !== entryKey),
	};
}

/**
 * Direct edit of a tallied line. Retracting through the list would leave the press
 * history describing counts that no longer exist, so the history is rebuilt to match
 * — Backspace after an edit retracts from what is actually on screen.
 */
export function applySetCount(state: TallyState, entryKey: string, count: number): TallyState {
	const existing = state.counts.get(entryKey);
	if (existing === undefined) {
		return state;
	}
	const normalized = Math.max(0, Math.trunc(count));
	const counts = new Map(state.counts);
	if (normalized === 0) {
		counts.delete(entryKey);
	} else {
		counts.set(entryKey, { ...existing, count: normalized });
	}
	return {
		counts,
		history: rebuildHistory(state.history, entryKey, normalized),
		recency: counts.has(entryKey) ? state.recency : state.recency.filter((key) => key !== entryKey),
	};
}

/** Tallied lines, most recently touched first. */
export function tallyEntries(state: TallyState): readonly TallyEntry[] {
	return state.recency
		.map((entryKey) => state.counts.get(entryKey))
		.filter((entry): entry is TallyEntry => entry !== undefined);
}

/** Keep exactly `count` presses for `entryKey`, preserving the order of the rest. */
function rebuildHistory(
	history: readonly string[],
	entryKey: string,
	count: number,
): readonly string[] {
	const others = history.filter((key) => key !== entryKey);
	return [...others, ...Array.from({ length: count }, () => entryKey)];
}

// --- hook --------------------------------------------------------------------

export interface KeyEntryTally {
	readonly entries: readonly TallyEntry[];
	readonly total: number;
	/** True when nothing has been tallied and there is nothing to save or discard. */
	readonly isEmpty: boolean;
	/** The last press, for the "you just recorded X" feedback line. */
	readonly lastEntryKey: string | null;
	readonly canUndo: boolean;
	readonly add: (speciesId: string, variant: TallyVariant) => void;
	readonly undo: () => void;
	readonly clear: () => void;
	readonly setCount: (entryKey: string, count: number) => void;
}

/**
 * The modal's session tally: a local count of what this sitting has added, kept
 * separate from what is stored. Commit turns the tally into target counts
 * (`baseline + tally`) rather than increments, so flushing twice — which auto-save
 * does routinely — can never double-count.
 */
export function useKeyEntryTally(): KeyEntryTally {
	const [state, setState] = useState<TallyState>(EMPTY_TALLY_STATE);

	const add = useCallback((speciesId: string, variant: TallyVariant) => {
		setState((current) => applyPress(current, speciesId, variant));
	}, []);

	const undo = useCallback(() => {
		setState(applyUndo);
	}, []);

	const clear = useCallback(() => {
		setState(EMPTY_TALLY_STATE);
	}, []);

	const setCount = useCallback((entryKey: string, count: number) => {
		setState((current) => applySetCount(current, entryKey, count));
	}, []);

	const entries = useMemo(() => tallyEntries(state), [state]);
	const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.count, 0), [entries]);

	return {
		entries,
		total,
		isEmpty: entries.length === 0,
		lastEntryKey: state.history.at(-1) ?? null,
		canUndo: state.history.length > 0,
		add,
		undo,
		clear,
		setCount,
	};
}
