/**
 * PROTOTYPE, throwaway. Variant B, "The stop is the form": opening a run
 * lands on its first pending stop, and the stop screen carries the record
 * fields inline under a one-line summary. Save and next is a fixed bar at the
 * thumb. Stops page with arrows; the list is a sheet behind the header.
 */
import { useState } from 'react';
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
import { Btn, Chips, c, Header, Sheet, s, Tap, Toast } from './ui';

export const nameB = 'The stop is the form';

export function VariantB() {
	const store = useStore();
	const [at, setAt] = useState<{ run: Run; stop: Stop } | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [prompt, setPrompt] = useState<Run | null>(null);

	const go = (run: Run, stop: Stop) => {
		store.openStop(stop);
		setAt({ run, stop });
	};

	const flash = (text: string) => {
		setToast(text);
		setTimeout(() => setToast(null), 2000);
	};

	if (!at) {
		return (
			<View style={s.fill}>
				<OpsList onOpen={(run) => go(run, store.nextPending(run) ?? run.stops[0]!)} />
				<View style={{ height: 64 }} />
			</View>
		);
	}

	return (
		<View style={s.fill}>
			<StopForm
				key={at.stop.id}
				run={at.run}
				stop={at.stop}
				onExit={() => setAt(null)}
				onGo={(stop) => go(at.run, stop)}
				onAdvance={(label) => {
					const next = store.nextPending(at.run, at.stop);
					flash(label);
					if (next) go(at.run, next);
					else setPrompt(at.run);
				}}
			/>
			{toast ? <Toast text={toast} /> : null}
			{prompt ? (
				<CompletePrompt
					run={prompt}
					onDone={() => {
						setPrompt(null);
						setAt(null);
					}}
				/>
			) : null}
		</View>
	);
}

function StopForm({
	run,
	stop,
	onExit,
	onGo,
	onAdvance,
}: {
	readonly run: Run;
	readonly stop: Stop;
	readonly onExit: () => void;
	readonly onGo: (stop: Stop) => void;
	readonly onAdvance: (label: string) => void;
}) {
	const store = useStore();
	const st = store.stopState(stop.id);
	const idx = run.stops.findIndex((x) => x.id === stop.id);
	const pending = store.trapPending[stop.id] ?? false;
	const [mode, setMode] = useState<TrapMode>(pending ? 'collect-reset' : 'set');
	const [insp, setInsp] = useState<InspectionDraft>(emptyInspection);
	const [trap, setTrap] = useState<TrapDraft>(() => emptyTrap(stop));
	const [action, setAction] = useState<ActionDraft>(() => emptyAction(stop));
	const [skipping, setSkipping] = useState(false);
	const [listing, setListing] = useState(false);
	const [more, setMore] = useState(false);
	const editable = run.mine && st.status === 'pending';
	const problem = stop.kind === 'habitat' ? inspectionProblem(insp) : null;

	const save = () => {
		const p =
			stop.kind === 'habitat'
				? inspectionProgress(insp)
				: stop.kind === 'mission'
					? actionProgress(stop, action)
					: trapProgress(mode, trap);
		store.progress(run, stop, p);
		onAdvance(`${p.outcome} saved`);
	};

	const modeLabels: Record<TrapMode, string> = {
		'collect-reset': 'Collect + reset',
		collect: 'Collect',
		set: 'Set',
	};

	return (
		<View style={s.fill}>
			<Header
				title={`Stop ${idx + 1} of ${run.stops.length}`}
				sub={run.title}
				onBack={onExit}
				right={
					<View style={s.row}>
						<Tap disabled={idx === 0} onPress={() => onGo(run.stops[idx - 1]!)} style={s.back}>
							<Text style={s.backGlyph}>‹</Text>
						</Tap>
						<Tap
							disabled={idx === run.stops.length - 1}
							onPress={() => onGo(run.stops[idx + 1]!)}
							style={s.back}
						>
							<Text style={s.backGlyph}>›</Text>
						</Tap>
						<Tap onPress={() => setListing(true)} style={s.back}>
							<Text style={{ fontSize: 20, color: c.accent }}>☰</Text>
						</Tap>
					</View>
				}
			/>
			<ScrollView contentContainerStyle={s.pad}>
				<View style={{ gap: 2 }}>
					<Text style={s.title}>{stop.name}</Text>
					<Text style={s.muted}>
						{stop.code} · {stop.detail} · {stop.distance}
					</Text>
					{stop.notes ? <Text style={[s.muted, { color: c.danger }]}>{stop.notes}</Text> : null}
					<Text style={s.muted} numberOfLines={1}>
						Last: {st.records.at(-1) ?? stop.history[0]}
					</Text>
					{stop.requested ? (
						<Text style={s.strong}>
							Requested: {stop.requested.product}, {stop.requested.amount} {stop.requested.unit}
						</Text>
					) : null}
					{pending && stop.pendingSince ? <Text style={s.strong}>{stop.pendingSince}</Text> : null}
				</View>
				{!run.mine ? (
					<Text style={s.muted}>{run.owner}'s work. Ask a Manager to reassign it on web.</Text>
				) : null}
				{run.mine && st.status === 'skipped' ? (
					<>
						<Text style={s.strong}>Skipped · {st.skipReason}</Text>
						<Btn label="Unskip" onPress={() => store.unskip(run, stop)} />
					</>
				) : null}
				{run.mine && st.status === 'done' ? (
					<>
						<Text style={s.strong}>Done · {st.records.at(-1)}</Text>
						<Btn label="Reopen stop" onPress={() => store.reopen(run, stop)} />
					</>
				) : null}
				{editable && stop.kind === 'trap' ? (
					<Chips
						options={(pending ? ['collect-reset', 'collect'] : ['set']).map(
							(m) => modeLabels[m as TrapMode],
						)}
						value={modeLabels[mode]}
						onChange={(label) =>
							setMode(
								(Object.keys(modeLabels) as TrapMode[]).find((k) => modeLabels[k] === label) ??
									'set',
							)
						}
					/>
				) : null}
				{editable && stop.kind === 'habitat' ? (
					<InspectionFields draft={insp} set={setInsp} />
				) : null}
				{editable && stop.kind === 'trap' ? (
					<TrapFields mode={mode} draft={trap} set={setTrap} />
				) : null}
				{editable && stop.kind === 'mission' ? (
					<ActionFields stop={stop} draft={action} set={setAction} />
				) : null}
				<Tap onPress={() => setMore((m) => !m)} style={{ paddingVertical: 8 }}>
					<Text style={{ color: c.accent, fontWeight: '600' }}>
						{more ? 'Less' : 'History, comment, directions…'}
					</Text>
				</Tap>
				{more ? (
					<View style={{ gap: 8 }}>
						<History stop={stop} />
						{stop.directions ? <Text style={s.muted}>Directions: {stop.directions}</Text> : null}
						<Btn
							label="Comment"
							onPress={() => store.comment(stop, 'Standing water by the culvert')}
						/>
						{editable ? (
							<Btn
								label="Complete, no record"
								onPress={() => {
									store.progress(run, stop, completeWithoutRecord(run));
									onAdvance('Stop completed');
								}}
							/>
						) : null}
					</View>
				) : null}
			</ScrollView>
			{editable ? (
				<View style={[s.bar, { paddingBottom: 64 }]}>
					<Btn label="Skip" onPress={() => setSkipping(true)} style={{ flex: 1 }} />
					<Tap onPress={save} disabled={problem !== null} style={[s.btn, s.primary, { flex: 2 }]}>
						<Text style={[s.btnLabel, s.onAccent]}>{problem ?? 'Save and next'}</Text>
					</Tap>
				</View>
			) : (
				<View style={{ height: 64 }} />
			)}
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
			{listing ? (
				<Sheet onClose={() => setListing(false)}>
					<Text style={s.title}>{run.title}</Text>
					<ScrollView contentContainerStyle={{ gap: 8 }}>
						{run.stops.map((x) => (
							<StopRow
								key={x.id}
								run={run}
								stop={x}
								onPress={() => {
									setListing(false);
									onGo(x);
								}}
							/>
						))}
					</ScrollView>
				</Sheet>
			) : null}
		</View>
	);
}
