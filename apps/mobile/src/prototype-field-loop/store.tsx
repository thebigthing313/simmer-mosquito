/**
 * PROTOTYPE, throwaway. In-memory state for the field loop prototype (#1338).
 *
 * Every write the loop would make is appended to a command log under the real
 * command name, so a reviewer can check what a tap sends. A tap counter resets
 * whenever a stop opens and is written to the tap log when the stop is left
 * with an outcome, which is the number the ticket asks about.
 */
import { createContext, type ReactNode, useContext, useRef, useState } from 'react';
import { RUNS, type Run, type Stop } from './fixture';

export type StopStatus = 'pending' | 'done' | 'skipped';
export type RunStatus = 'not_started' | 'in_progress' | 'completed';

type StopState = {
	readonly status: StopStatus;
	readonly skipReason?: string | undefined;
	readonly records: readonly string[];
};

type LogEntry = { readonly id: number; readonly text: string; readonly discarded: boolean };
type TapEntry = { readonly stop: string; readonly outcome: string; readonly taps: number };

type Data = {
	readonly runStatus: Readonly<Record<string, RunStatus>>;
	readonly stops: Readonly<Record<string, StopState>>;
	readonly trapPending: Readonly<Record<string, boolean>>;
};

function initialData(): Data {
	const runStatus: Record<string, RunStatus> = {};
	const stops: Record<string, StopState> = {};
	const trapPending: Record<string, boolean> = {};
	for (const run of RUNS) {
		runStatus[run.id] = 'not_started';
		for (const stop of run.stops) {
			stops[stop.id] = { status: 'pending', records: [] };
			if (stop.kind === 'trap') trapPending[stop.id] = stop.pendingSince !== undefined;
		}
	}
	return { runStatus, stops, trapPending };
}

export type Progress = {
	/** Short words for the tap log, e.g. "Dry inspection". */
	readonly outcome: string;
	/** Command names with a one-line argument gist, in send order. */
	readonly commands: readonly string[];
	/** What a record line on the stop says afterwards. */
	readonly record?: string;
	readonly status: 'done' | 'skipped' | 'pending';
	readonly skipReason?: string | undefined;
	/** Trap stops: whether a collection is waiting afterwards. */
	readonly trapPending?: boolean | undefined;
};

type Store = Data & {
	readonly log: readonly LogEntry[];
	readonly taps: number;
	readonly tapLog: readonly TapEntry[];
	stopState(id: string): StopState;
	tap(): void;
	openStop(stop: Stop): void;
	progress(run: Run, stop: Stop, p: Progress): number;
	undo(token: number): void;
	unskip(run: Run, stop: Stop): void;
	reopen(run: Run, stop: Stop): void;
	startRun(run: Run): void;
	completeRun(run: Run): void;
	comment(stop: Stop, text: string): void;
	reset(): void;
	nextPending(run: Run, after?: Stop): Stop | undefined;
	stopNumber(run: Run, stop: Stop): number;
};

const EMPTY: StopState = { status: 'pending', records: [] };
const at = (d: Data, id: string): StopState => d.stops[id] ?? EMPTY;

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
	const store = useContext(StoreContext);
	if (!store) throw new Error('prototype store missing');
	return store;
}

const ns = (run: Run) => (run.kind === 'assignment' ? 'fieldWork' : 'missionDispatch');
const noun = (run: Run) => (run.kind === 'assignment' ? 'Assignment' : 'Mission');

export function PrototypeStore({ children }: { readonly children: ReactNode }) {
	const [data, setData] = useState<Data>(initialData);
	const [log, setLog] = useState<LogEntry[]>([]);
	const [taps, setTaps] = useState(0);
	const [tapLog, setTapLog] = useState<TapEntry[]>([]);
	const nextId = useRef(1);
	const undoable = useRef(new Map<number, { data: Data; logIds: number[] }>());
	const currentStop = useRef<string>('');
	// The press handler that saves runs before the render its own tap causes,
	// so the count is read from a ref rather than from state.
	const tapCount = useRef(0);
	const setTapCount = (n: number) => {
		tapCount.current = n;
		setTaps(n);
	};

	const append = (texts: readonly string[]): number[] => {
		const entries = texts.map((text) => ({ id: nextId.current++, text, discarded: false }));
		setLog((l) => [...l, ...entries]);
		return entries.map((e) => e.id);
	};

	const store: Store = {
		...data,
		log,
		taps,
		tapLog,
		stopState: (id) => data.stops[id] ?? EMPTY,
		tap: () => setTapCount(tapCount.current + 1),
		openStop: (stop) => {
			currentStop.current = `${stop.code} ${stop.name}`;
			setTapCount(0);
		},
		progress: (run, stop, p) => {
			const before = data;
			const commands: string[] = [];
			if (data.runStatus[run.id] === 'not_started') {
				commands.push(`${ns(run)}.start${noun(run)} (auto, first progress)`);
			}
			commands.push(...p.commands);
			const logIds = append(commands);
			setData((d) => ({
				runStatus: { ...d.runStatus, [run.id]: 'in_progress' },
				stops: {
					...d.stops,
					[stop.id]: {
						status: p.status,
						skipReason: p.skipReason,
						records: p.record ? [...at(d, stop.id).records, p.record] : at(d, stop.id).records,
					},
				},
				trapPending:
					p.trapPending === undefined
						? d.trapPending
						: { ...d.trapPending, [stop.id]: p.trapPending },
			}));
			setTapLog((t) => [...t, { stop: stop.code, outcome: p.outcome, taps: tapCount.current }]);
			setTapCount(0);
			const token = nextId.current++;
			undoable.current.set(token, { data: before, logIds });
			return token;
		},
		undo: (token) => {
			const entry = undoable.current.get(token);
			if (!entry) return;
			undoable.current.delete(token);
			setData(entry.data);
			setLog((l) => [
				...l.map((e) => (entry.logIds.includes(e.id) ? { ...e, discarded: true } : e)),
				{
					id: nextId.current++,
					text: '↶ undo: discarded from the queue before sending',
					discarded: false,
				},
			]);
			setTapLog((t) => [...t.slice(0, -1)]);
		},
		unskip: (run, stop) => {
			append([`${ns(run)}.unskip${noun(run)}Item`]);
			setData((d) => ({
				...d,
				stops: {
					...d.stops,
					[stop.id]: { ...at(d, stop.id), status: 'pending', skipReason: undefined },
				},
			}));
		},
		reopen: (run, stop) => {
			append([`${ns(run)}.reopen${noun(run)}Item`]);
			setData((d) => ({
				...d,
				stops: { ...d.stops, [stop.id]: { ...at(d, stop.id), status: 'pending' } },
			}));
		},
		startRun: (run) => {
			if (data.runStatus[run.id] !== 'not_started') return;
			append([`${ns(run)}.start${noun(run)}`]);
			setData((d) => ({ ...d, runStatus: { ...d.runStatus, [run.id]: 'in_progress' } }));
		},
		completeRun: (run) => {
			append([`${ns(run)}.complete${noun(run)}`]);
			setData((d) => ({ ...d, runStatus: { ...d.runStatus, [run.id]: 'completed' } }));
		},
		comment: (stop, text) => {
			append([`fieldWork.createComment on ${stop.code}: "${text}"`]);
		},
		reset: () => {
			setData(initialData());
			setLog([]);
			setTapCount(0);
			setTapLog([]);
			undoable.current.clear();
		},
		nextPending: (run, after) => {
			const start = after ? run.stops.findIndex((s) => s.id === after.id) + 1 : 0;
			const ordered = [...run.stops.slice(start), ...run.stops.slice(0, start)];
			return ordered.find((s) => s.id !== after?.id && at(data, s.id).status === 'pending');
		},
		stopNumber: (run, stop) => run.stops.findIndex((s) => s.id === stop.id) + 1,
	};

	return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
