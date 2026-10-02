/**
 * PROTOTYPE, throwaway. Variant A, "As decided": the loop exactly as "Which
 * screens the field app has" (#1334) wrote it. Ops, then the run's stop list,
 * then a stop screen with the summary and history and one primary action,
 * then a full-screen record form, and Save lands on the next pending stop.
 */
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Run, Stop } from './fixture';
import {
	type ActionDraft,
	ActionFields,
	actionProgress,
	completeWithoutRecord,
	emptyAction,
	emptyInspection,
	emptyTrap,
	type InspectionDraft,
	InspectionFields,
	inspectionProblem,
	inspectionProgress,
	skipProgress,
	type TrapDraft,
	TrapFields,
	type TrapMode,
	trapProgress,
} from './forms';
import { CompletePrompt, History, OpsList, SkipSheet, StopRow } from './shared';
import { useStore } from './store';
import { Btn, c, Header, s, Tap, Toast } from './ui';

type Screen =
	| { name: 'ops' }
	| { name: 'run'; run: Run }
	| { name: 'stop'; run: Run; stop: Stop }
	| { name: 'form'; run: Run; stop: Stop; mode: 'inspection' | TrapMode | 'action' };

export const nameA = 'As decided';

export function VariantA() {
	const [stack, setStack] = useState<Screen[]>([{ name: 'ops' }]);
	const [toast, setToast] = useState<string | null>(null);
	const [prompt, setPrompt] = useState<Run | null>(null);
	const store = useStore();
	const top: Screen = stack.at(-1) ?? { name: 'ops' };
	const push = (sc: Screen) => setStack((st) => [...st, sc]);
	const pop = () => setStack((st) => st.slice(0, -1));

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 2500);
		return () => clearTimeout(t);
	}, [toast]);

	const openStop = (run: Run, stop: Stop) => {
		store.openStop(stop);
		push({ name: 'stop', run, stop });
	};

	/** After an outcome: next pending stop's screen, or back to the list and the prompt. */
	const advance = (run: Run, stop: Stop, label: string) => {
		const next = store.nextPending(run, stop);
		if (next) {
			store.openStop(next);
			setStack((st) => [
				...st.filter((x) => x.name === 'ops' || x.name === 'run'),
				{ name: 'stop', run, stop: next },
			]);
			setToast(`${label} · stop ${store.stopNumber(run, next)} of ${run.stops.length} next`);
		} else {
			setStack((st) => st.filter((x) => x.name === 'ops' || x.name === 'run'));
			setToast(label);
			setPrompt(run);
		}
	};

	return (
		<View style={s.fill}>
			<View style={{ flex: 1 }}>
				{top.name === 'ops' ? <OpsList onOpen={(run) => push({ name: 'run', run })} /> : null}
				{top.name === 'run' ? (
					<RunScreen run={top.run} onBack={pop} onStop={(st) => openStop(top.run, st)} />
				) : null}
				{top.name === 'stop' ? (
					<StopScreen
						run={top.run}
						stop={top.stop}
						onBack={pop}
						onRecord={(mode) => push({ name: 'form', run: top.run, stop: top.stop, mode })}
						onAdvance={(label) => advance(top.run, top.stop, label)}
					/>
				) : null}
				{top.name === 'form' ? (
					<FormScreen
						run={top.run}
						stop={top.stop}
						mode={top.mode}
						onBack={pop}
						onSaved={(label) => advance(top.run, top.stop, label)}
					/>
				) : null}
			</View>
			<TabBar />
			{toast ? <Toast text={toast} /> : null}
			{prompt ? <CompletePrompt run={prompt} onDone={() => setPrompt(null)} /> : null}
		</View>
	);
}

function TabBar() {
	return (
		<View style={[s.bar, { justifyContent: 'space-around', paddingBottom: 64 }]}>
			{['Map', 'Larval', 'Adult', 'Control', 'Ops'].map((t) => (
				<Text
					key={t}
					style={{
						color: t === 'Ops' ? c.accent : c.textMuted,
						fontWeight: t === 'Ops' ? '700' : '500',
					}}
				>
					{t}
				</Text>
			))}
		</View>
	);
}

function RunScreen({
	run,
	onBack,
	onStop,
}: {
	readonly run: Run;
	readonly onBack: () => void;
	readonly onStop: (stop: Stop) => void;
}) {
	const { runStatus, startRun } = useStore();
	const status = runStatus[run.id] ?? 'not_started';
	return (
		<View style={s.fill}>
			<Header
				title={run.title}
				sub={`${run.subtitle} · ${status.replace('_', ' ')}`}
				onBack={onBack}
			/>
			<ScrollView contentContainerStyle={s.pad}>
				{!run.mine ? (
					<Text style={s.muted}>{run.owner}'s work. Ask a Manager to reassign it on web.</Text>
				) : status === 'not_started' ? (
					<Btn label="Start" tone="primary" onPress={() => startRun(run)} />
				) : null}
				{run.stops.map((st) => (
					<StopRow key={st.id} run={run} stop={st} onPress={() => onStop(st)} />
				))}
			</ScrollView>
		</View>
	);
}

function StopScreen({
	run,
	stop,
	onBack,
	onRecord,
	onAdvance,
}: {
	readonly run: Run;
	readonly stop: Stop;
	readonly onBack: () => void;
	readonly onRecord: (mode: 'inspection' | TrapMode | 'action') => void;
	readonly onAdvance: (label: string) => void;
}) {
	const store = useStore();
	const [skipping, setSkipping] = useState(false);
	const st = store.stopState(stop.id);
	const n = store.stopNumber(run, stop);

	const primary = () => {
		if (!run.mine) return null;
		if (st.status === 'skipped') {
			return <Btn label="Unskip" tone="primary" onPress={() => store.unskip(run, stop)} />;
		}
		if (st.status === 'done' && stop.kind !== 'mission') {
			return <Btn label="Reopen stop" onPress={() => store.reopen(run, stop)} />;
		}
		if (stop.kind === 'habitat')
			return (
				<Btn big label="Record inspection" tone="primary" onPress={() => onRecord('inspection')} />
			);
		if (stop.kind === 'trap') {
			return (store.trapPending[stop.id] ?? false) ? (
				<View style={{ gap: 8 }}>
					<Btn
						big
						label="Collect and reset"
						tone="primary"
						onPress={() => onRecord('collect-reset')}
					/>
					<Btn label="Collect" onPress={() => onRecord('collect')} />
				</View>
			) : (
				<Btn big label="Set" tone="primary" onPress={() => onRecord('set')} />
			);
		}
		return (
			<Btn
				big
				label={
					st.status === 'done' ? 'Record another' : `Record ${stop.requested?.action.toLowerCase()}`
				}
				tone={st.status === 'done' ? 'secondary' : 'primary'}
				onPress={() => onRecord('action')}
			/>
		);
	};

	return (
		<View style={s.fill}>
			<Header
				title={`${n}. ${stop.name}`}
				sub={`${stop.code} · ${stop.detail} · ${stop.distance}`}
				onBack={onBack}
			/>
			<ScrollView contentContainerStyle={s.pad}>
				{stop.notes ? <Text style={[s.body, { color: c.danger }]}>{stop.notes}</Text> : null}
				{stop.pendingSince && (store.trapPending[stop.id] ?? false) ? (
					<Text style={s.strong}>{stop.pendingSince}</Text>
				) : null}
				{stop.requested ? (
					<Text style={s.strong}>
						Requested: {stop.requested.product}, {stop.requested.amount} {stop.requested.unit}
					</Text>
				) : null}
				<View style={s.card}>
					<Text style={s.label}>Recent</Text>
					<History stop={stop} />
				</View>
				{st.status !== 'pending' ? (
					<Text style={s.strong}>
						{st.status === 'skipped' ? `Skipped · ${st.skipReason}` : 'Done'}
					</Text>
				) : null}
				{primary()}
				{run.mine && st.status === 'pending' ? (
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
						<Btn label="Skip" onPress={() => setSkipping(true)} />
						<Btn
							label="Complete, no record"
							onPress={() => {
								store.progress(run, stop, completeWithoutRecord(run));
								onAdvance('Stop completed');
							}}
						/>
						<Btn
							label="Comment"
							onPress={() => store.comment(stop, 'Standing water by the culvert')}
						/>
						<Btn label="Directions" onPress={() => {}} />
					</View>
				) : null}
				{stop.directions ? <Text style={s.muted}>Directions: {stop.directions}</Text> : null}
			</ScrollView>
			{skipping ? (
				<SkipSheet
					onClose={() => setSkipping(false)}
					onPick={(reason) => {
						setSkipping(false);
						store.progress(run, stop, skipProgress(run, reason));
						onAdvance(`Skipped: ${reason}`);
					}}
				/>
			) : null}
		</View>
	);
}

function FormScreen({
	run,
	stop,
	mode,
	onBack,
	onSaved,
}: {
	readonly run: Run;
	readonly stop: Stop;
	readonly mode: 'inspection' | TrapMode | 'action';
	readonly onBack: () => void;
	readonly onSaved: (label: string) => void;
}) {
	const store = useStore();
	const [insp, setInsp] = useState<InspectionDraft>(emptyInspection);
	const [trap, setTrap] = useState<TrapDraft>(() => emptyTrap(stop));
	const [action, setAction] = useState<ActionDraft>(() => emptyAction(stop));
	const problem = mode === 'inspection' ? inspectionProblem(insp) : null;
	const title =
		mode === 'inspection'
			? 'Inspection'
			: mode === 'action'
				? (stop.requested?.action ?? 'Action')
				: mode === 'set'
					? 'Set trap'
					: mode === 'collect'
						? 'Collect'
						: 'Collect and reset';

	const save = () => {
		const p =
			mode === 'inspection'
				? inspectionProgress(insp)
				: mode === 'action'
					? actionProgress(stop, action)
					: trapProgress(mode, trap);
		store.progress(run, stop, p);
		onSaved(`${p.outcome} saved`);
	};

	return (
		<View style={s.fill}>
			<Header title={title} sub={stop.name} onBack={onBack} />
			<ScrollView contentContainerStyle={s.pad}>
				{mode === 'inspection' ? <InspectionFields draft={insp} set={setInsp} /> : null}
				{mode === 'action' ? <ActionFields stop={stop} draft={action} set={setAction} /> : null}
				{mode !== 'inspection' && mode !== 'action' ? (
					<TrapFields mode={mode} draft={trap} set={setTrap} />
				) : null}
			</ScrollView>
			<View style={s.bar}>
				<Tap onPress={save} disabled={problem !== null} style={[s.btn, s.primary, { flex: 1 }]}>
					<Text style={[s.btnLabel, s.onAccent]}>{problem ?? 'Save'}</Text>
				</Tap>
			</View>
		</View>
	);
}
