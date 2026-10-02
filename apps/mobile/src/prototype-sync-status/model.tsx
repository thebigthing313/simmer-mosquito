/**
 * PROTOTYPE, throwaway. In-memory state for the sync status prototype (#1348).
 *
 * The queue follows "Offline command queue and replay" (#1335): one queue in
 * creation order, statuses pending, held, refused and stuck, a refusal holding
 * the commands that touch the same ids. Each Organization keeps its own queue
 * and records, which is "one SQLite file per Account and Organization" (#1345).
 * The scenario panel drives everything the server and the network would.
 */
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';

export type Tab = 'map' | 'larval' | 'adult' | 'control' | 'ops';
export type CmdStatus = 'undo' | 'pending' | 'held' | 'refused' | 'stuck';
export type Network = 'wifi' | 'cellular' | 'offline';

export type Rec = {
	readonly id: string;
	readonly tab: Exclude<Tab, 'map'>;
	readonly type: string;
	readonly title: string;
	readonly sub: string;
	readonly fields: readonly (readonly [string, string])[];
};

export type Cmd = {
	readonly id: string;
	/** The real command name, for the reviewer. */
	readonly command: string;
	/** What the Collector did, in their words. */
	readonly summary: string;
	readonly recordId: string;
	readonly touches: readonly string[];
	readonly status: CmdStatus;
	readonly savedAt: string;
	readonly ageDays: number;
	readonly attempts: number;
	readonly reason?: string | undefined;
	readonly httpStatus?: number | undefined;
	/** A correction: days until its window closes, measured at server receipt. */
	readonly windowDaysLeft?: number | undefined;
	readonly heldBehind?: string | undefined;
	/** The scenario panel marks a command the server will refuse on its next send. */
	readonly willRefuse?: boolean | undefined;
};

type OrgData = {
	readonly records: readonly Rec[];
	readonly cmds: readonly Cmd[];
	readonly lastSynced: string;
};

export type Download = {
	readonly label: string;
	readonly done: number;
	readonly total: number;
	readonly unit: string;
};

export type Session = 'ok' | 'dead' | 'viewer';
export type Track = null | { readonly state: 'recording' | 'paused'; readonly seconds: number };

export const ME = { name: 'Dana Kowalski', initials: 'DK', first: 'Dana' };
export const ORGS = [
	{ name: 'Northfield', role: 'Collector' },
	{ name: 'Eastbrook', role: 'Collector' },
	{ name: 'Westvale', role: 'Viewer' },
] as const;

const NORTHFIELD: OrgData = {
	lastSynced: '9:12 AM',
	records: [
		{
			id: 'r1',
			tab: 'larval',
			type: 'Inspection',
			title: 'HAB-0142 · Roadside ditch, Elm St',
			sub: 'Today 10:04 · Wet · light · 12 dips',
			fields: [
				['Habitat', 'HAB-0142 · Roadside ditch, Elm St'],
				['Water', 'Wet'],
				['Density', 'Light'],
				['Dips', '12'],
				['Stages', 'L3, L4'],
			],
		},
		{
			id: 'r2',
			tab: 'larval',
			type: 'Sample',
			title: 'From HAB-0142 inspection',
			sub: 'Today 10:06 · 1 vial',
			fields: [
				['Inspection', 'HAB-0142 · Today 10:04'],
				['Vials', '1'],
			],
		},
		{
			id: 'r5',
			tab: 'larval',
			type: 'Inspection',
			title: 'HAB-0188 · Retention pond, Mill Rd',
			sub: 'Today 9:31 · Dry',
			fields: [
				['Habitat', 'HAB-0188 · Retention pond, Mill Rd'],
				['Water', 'Dry'],
			],
		},
		{
			id: 'r3',
			tab: 'adult',
			type: 'Collection',
			title: 'TRP-021 · Gravid trap, Oak Park',
			sub: 'Today 10:20 · collected and reset',
			fields: [
				['Trap', 'TRP-021 · Gravid trap, Oak Park'],
				['Collected', 'Today 10:20'],
				['Lure', 'Hay infusion'],
			],
		},
		{
			id: 'r4',
			tab: 'control',
			type: 'Chemical application',
			title: 'HAB-0177 · Bti granules',
			sub: 'Sep 2 · 4.5 lb · corrected today',
			fields: [
				['Target', 'HAB-0177 · Salt marsh pool'],
				['Product', 'Bti granules'],
				['Amount', '4.5 lb (was 45 lb)'],
			],
		},
		{
			id: 'r6',
			tab: 'ops',
			type: 'Assignment stop',
			title: 'Tuesday ditch route · stop 3',
			sub: 'Completed today 10:04',
			fields: [
				['Assignment', 'Tuesday ditch route'],
				['Stop', '3 · HAB-0142'],
			],
		},
	],
	cmds: [
		{
			id: 'c1',
			command: 'fieldWork.recordHabitatInspectionForAssignmentItem',
			summary: 'Inspection at HAB-0142',
			recordId: 'r1',
			touches: ['r1', 'hab-0142', 'r6'],
			status: 'pending',
			savedAt: '10:04 AM',
			ageDays: 0,
			attempts: 0,
		},
		{
			id: 'c2',
			command: 'larvalSurveillance.addInspectionSample',
			summary: 'Sample from the HAB-0142 inspection',
			recordId: 'r2',
			touches: ['r2', 'r1'],
			status: 'pending',
			savedAt: '10:06 AM',
			ageDays: 0,
			attempts: 0,
		},
		{
			id: 'c3',
			command: 'fieldWork.collectTrapCollectionForAssignmentItem',
			summary: 'Collect and reset TRP-021',
			recordId: 'r3',
			touches: ['r3', 'trp-021'],
			status: 'pending',
			savedAt: '10:20 AM',
			ageDays: 0,
			attempts: 0,
		},
		{
			id: 'c4',
			command: 'controlOperations.updateChemicalApplicationFieldDetails',
			summary: 'Correct the amount on the Sep 2 application at HAB-0177',
			recordId: 'r4',
			touches: ['r4'],
			status: 'pending',
			savedAt: '10:31 AM',
			ageDays: 0,
			attempts: 0,
			windowDaysLeft: 2,
		},
	],
};

const EASTBROOK: OrgData = {
	lastSynced: 'Sep 30',
	records: [
		{
			id: 'e1',
			tab: 'larval',
			type: 'Inspection',
			title: 'HAB-0911 · Tire pile, Route 9',
			sub: 'Sep 30 · Wet · moderate',
			fields: [['Habitat', 'HAB-0911']],
		},
		{
			id: 'e2',
			tab: 'adult',
			type: 'Collection',
			title: 'TRP-310 · CDC light trap',
			sub: 'Sep 30 · set',
			fields: [['Trap', 'TRP-310']],
		},
		{
			id: 'e3',
			tab: 'larval',
			type: 'Inspection',
			title: 'HAB-0915 · Catch basin, 4th St',
			sub: 'Sep 30 · Dry',
			fields: [['Habitat', 'HAB-0915']],
		},
	],
	cmds: ['e1', 'e2', 'e3'].map((id, i) => ({
		id: `ce${i}`,
		command: 'larvalSurveillance.recordHabitatInspection',
		summary: `Sep 30 record ${i + 1}`,
		recordId: id,
		touches: [id],
		status: 'pending' as const,
		savedAt: 'Sep 30',
		ageDays: 2,
		attempts: 0,
	})),
};

const NOW = '10:42 AM';
const UNDO_MS = 5000;
const REFUSAL = {
	httpStatus: 409,
	reason: 'M. Chen deactivated HAB-0142 on Oct 1, so it takes no new inspections.',
};

type State = {
	readonly org: string;
	readonly orgs: Readonly<Record<string, OrgData>>;
	readonly network: Network;
	readonly session: Session;
	readonly sessionConfirmed: string;
	readonly history: Download;
	readonly basemap: Download;
	readonly cellularOk: boolean;
	readonly track: Track;
	readonly toast: string | null;
	/** Bumped when a refusal arrives, so a variant can interrupt. */
	readonly refusalTick: number;
	readonly signedOut: boolean;
};

function initial(): State {
	return {
		org: 'Northfield',
		orgs: {
			Northfield: NORTHFIELD,
			Eastbrook: EASTBROOK,
			Westvale: { records: [], cmds: [], lastSynced: '' },
		},
		network: 'offline',
		session: 'ok',
		sessionConfirmed: '9:12 AM',
		history: { label: 'History, 2025 and 2026', done: 1240, total: 3100, unit: 'records' },
		basemap: { label: 'Streets map, offline', done: 182, total: 310, unit: 'MB' },
		cellularOk: false,
		track: null,
		toast: null,
		refusalTick: 0,
		signedOut: false,
	};
}

export type Attention = 'refused' | 'held' | 'stuck' | 'old' | 'window';

/** Why a command is on the needs-attention list, or null. */
export function attentionOf(c: Cmd): Attention | null {
	if (c.status === 'refused') return 'refused';
	if (c.status === 'held') return 'held';
	if (c.status === 'stuck') return 'stuck';
	if (c.ageDays > 60) return 'old';
	if (c.windowDaysLeft !== undefined && c.windowDaysLeft <= 3) return 'window';
	return null;
}

function heldBy(cmds: readonly Cmd[], refused: Cmd): Cmd[] {
	const ids = new Set(refused.touches);
	const after = cmds.slice(cmds.indexOf(refused) + 1);
	return after.filter((c) => c.status !== 'refused' && c.touches.some((t) => ids.has(t)));
}

/** One pass of the executor: send pending commands in order, refusing and holding as marked. */
function drain(data: OrgData): { data: OrgData; refused: boolean; sent: number } {
	let cmds = [...data.cmds];
	let refused = false;
	let sent = 0;
	for (const c of [...cmds]) {
		const current = cmds.find((x) => x.id === c.id);
		if (!current || current.status !== 'pending') continue;
		if (current.willRefuse) {
			const r: Cmd = {
				...current,
				status: 'refused',
				...REFUSAL,
				willRefuse: false,
				attempts: current.attempts + 1,
			};
			cmds = cmds.map((x) => (x.id === r.id ? r : x));
			const held = new Set(heldBy(cmds, r).map((h) => h.id));
			cmds = cmds.map((x) =>
				held.has(x.id) ? { ...x, status: 'held' as const, heldBehind: r.id } : x,
			);
			refused = true;
		} else {
			cmds = cmds.filter((x) => x.id !== current.id);
			sent += 1;
		}
	}
	return { data: { ...data, cmds, lastSynced: NOW }, refused, sent };
}

function useModelState() {
	const [st, set] = useState<State>(initial);
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const data = st.orgs[st.org] ?? NORTHFIELD;
	const online = st.network !== 'offline';
	const sending = online && st.session === 'ok';

	const patchOrg = (fn: (d: OrgData) => OrgData) =>
		set((s) => ({ ...s, orgs: { ...s.orgs, [s.org]: fn(s.orgs[s.org] ?? NORTHFIELD) } }));

	// The executor: whenever the device can send and something is pending, drain.
	useEffect(() => {
		if (!sending || !data.cmds.some((c) => c.status === 'pending')) return;
		const t = setTimeout(() => {
			set((s) => {
				const d = s.orgs[s.org];
				if (!d) return s;
				const r = drain(d);
				return {
					...s,
					orgs: { ...s.orgs, [s.org]: r.data },
					sessionConfirmed: NOW,
					refusalTick: r.refused ? s.refusalTick + 1 : s.refusalTick,
					toast: r.sent > 0 && !r.refused ? null : s.toast,
				};
			});
		}, 900);
		return () => clearTimeout(t);
	}, [sending, data.cmds]);

	// Downloads creep forward on Wi-Fi, or on cellular once allowed.
	useEffect(() => {
		const can = st.network === 'wifi' || (st.network === 'cellular' && st.cellularOk);
		const busy = st.history.done < st.history.total || st.basemap.done < st.basemap.total;
		if (!can || !busy) return;
		const t = setInterval(() => {
			set((s) => ({
				...s,
				history: { ...s.history, done: Math.min(s.history.total, s.history.done + 310) },
				basemap: { ...s.basemap, done: Math.min(s.basemap.total, s.basemap.done + 32) },
			}));
		}, 700);
		return () => clearInterval(t);
	}, [st.network, st.cellularOk, st.history, st.basemap]);

	// The Track clock.
	useEffect(() => {
		if (st.track?.state !== 'recording') return;
		const t = setInterval(
			() =>
				set((s) => (s.track ? { ...s, track: { ...s.track, seconds: s.track.seconds + 1 } } : s)),
			1000,
		);
		return () => clearInterval(t);
	}, [st.track?.state]);

	const cmdFor = (recordId: string) => data.cmds.find((c) => c.recordId === recordId);

	return {
		...st,
		data,
		online,
		sending,
		cmdFor,
		attention: data.cmds.filter((c) => attentionOf(c) !== null),
		waiting: data.cmds.filter((c) => c.status === 'pending' || c.status === 'undo'),
		heldBy: (c: Cmd) => heldBy(data.cmds, c),
		unsentIn: (org: string) => (st.orgs[org]?.cmds ?? []).length,

		// --- what the Collector does ---
		/** A one-tap save from the field loop: held for the Undo window, then queued. */
		quickSave() {
			const id = `q${Date.now()}`;
			const recordId = `rq${Date.now()}`;
			patchOrg((d) => ({
				...d,
				records: [
					{
						id: recordId,
						tab: 'larval',
						type: 'Inspection',
						title: 'HAB-0151 · Storm drain, Ash Ave',
						sub: `Today ${NOW} · Dry`,
						fields: [
							['Habitat', 'HAB-0151 · Storm drain, Ash Ave'],
							['Water', 'Dry'],
						],
					},
					...d.records,
				],
				cmds: [
					...d.cmds,
					{
						id,
						command: 'fieldWork.recordHabitatInspectionForAssignmentItem',
						summary: 'Dry inspection at HAB-0151',
						recordId,
						touches: [recordId, 'hab-0151'],
						status: 'undo',
						savedAt: NOW,
						ageDays: 0,
						attempts: 0,
					},
				],
			}));
			set((s) => ({ ...s, toast: 'Dry inspection saved' }));
			timers.current.set(
				id,
				setTimeout(() => {
					patchOrg((d) => ({
						...d,
						cmds: d.cmds.map((c) => (c.id === id ? { ...c, status: 'pending' } : c)),
					}));
					set((s) => ({ ...s, toast: null }));
				}, UNDO_MS),
			);
		},
		undo() {
			const pending = data.cmds.find((c) => c.status === 'undo');
			if (!pending) return;
			clearTimeout(timers.current.get(pending.id));
			patchOrg((d) => ({
				...d,
				cmds: d.cmds.filter((c) => c.id !== pending.id),
				records: d.records.filter((r) => r.id !== pending.recordId),
			}));
			set((s) => ({ ...s, toast: null }));
		},
		/** Edit and resend: the command is replaced at its place and its dependents released. */
		resend(id: string, summary: string) {
			patchOrg((d) => ({
				...d,
				cmds: d.cmds.map((c) =>
					c.id === id
						? { ...c, status: 'pending', summary, reason: undefined, httpStatus: undefined }
						: c.heldBehind === id
							? { ...c, status: 'pending', heldBehind: undefined }
							: c,
				),
				records: d.records.map((r) =>
					r.id === d.cmds.find((c) => c.id === id)?.recordId
						? {
								...r,
								title: 'HAB-0143 · Roadside ditch, Elm St (south)',
								fields: [
									['Habitat', 'HAB-0143 · Roadside ditch, Elm St (south)'],
									...r.fields.slice(1),
								],
							}
						: r,
				),
			}));
			set((s) => ({ ...s, toast: 'Saved. It sends with the rest of the queue.' }));
		},
		/** Discard: rolls back the command's rows, and those of every command held behind it. */
		discard(id: string) {
			patchOrg((d) => {
				const c = d.cmds.find((x) => x.id === id);
				if (!c) return d;
				const gone = new Set([id, ...heldBy(d.cmds, c).map((h) => h.id)]);
				const rows = new Set(d.cmds.filter((x) => gone.has(x.id)).map((x) => x.recordId));
				return {
					...d,
					cmds: d.cmds.filter((x) => !gone.has(x.id)),
					records: d.records.filter((r) => !rows.has(r.id)),
				};
			});
			set((s) => ({ ...s, toast: 'Discarded' }));
		},
		switchOrg(name: string) {
			set((s) => ({ ...s, org: name, toast: `Switched to ${name}` }));
		},
		signOut() {
			set((s) => ({ ...s, signedOut: true }));
		},
		signIn() {
			set((s) => ({ ...s, signedOut: false, session: 'ok', toast: null }));
		},
		allowCellular() {
			set((s) => ({ ...s, cellularOk: true }));
		},
		trackStart() {
			set((s) => ({ ...s, track: { state: 'recording', seconds: 0 } }));
		},
		trackPause() {
			set((s) =>
				s.track
					? {
							...s,
							track: { ...s.track, state: s.track.state === 'recording' ? 'paused' : 'recording' },
						}
					: s,
			);
		},
		trackFinish() {
			set((s) => ({ ...s, track: null, toast: 'Track saved as a source reduction route' }));
		},
		clearToast() {
			set((s) => ({ ...s, toast: null }));
		},

		// --- what the scenario panel does ---
		setNetwork(network: Network) {
			set((s) => ({ ...s, network }));
		},
		markRefuse() {
			patchOrg((d) => ({
				...d,
				cmds: d.cmds.map((c) => (c.id === 'c1' ? { ...c, willRefuse: true } : c)),
			}));
		},
		markStuck() {
			patchOrg((d) => ({
				...d,
				cmds: d.cmds.map((c) =>
					c.id === 'c3' ? { ...c, status: 'stuck', attempts: 10, httpStatus: 503 } : c,
				),
			}));
		},
		ageOne() {
			patchOrg((d) => ({
				...d,
				cmds: d.cmds.map((c, i) => (i === 0 ? { ...c, ageDays: 61, savedAt: 'Aug 2' } : c)),
			}));
		},
		killSession() {
			set((s) => ({ ...s, session: 'dead', signedOut: true }));
		},
		dropRole() {
			set((s) => ({ ...s, session: 'viewer' }));
		},
		restoreRole() {
			set((s) => ({ ...s, session: 'ok' }));
		},
		reset() {
			for (const t of timers.current.values()) clearTimeout(t);
			set(initial());
		},
	};
}

export type Model = ReturnType<typeof useModelState>;
const Ctx = createContext<Model | null>(null);

export function ModelProvider({ children }: { readonly children: ReactNode }) {
	return <Ctx.Provider value={useModelState()}>{children}</Ctx.Provider>;
}

export function useModel(): Model {
	const m = useContext(Ctx);
	if (!m) throw new Error('ModelProvider missing');
	return m;
}

export function fmtTrack(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const sec = seconds % 60;
	return `${m}:${sec.toString().padStart(2, '0')}`;
}
