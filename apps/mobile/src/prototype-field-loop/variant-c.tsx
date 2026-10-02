/**
 * PROTOTYPE, throwaway. Variant C, "Map and outcomes": a run opens on the
 * map with its stops as numbered pins and the current stop in a card at the
 * thumb. The card offers outcomes rather than a form: the common results save
 * on one tap behind an Undo, and only the uncommon ones open fields. Undo
 * discards the queued command before it is sent, which the offline queue
 * (#1335) makes possible.
 */
import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DENSITIES, type Run, STAGES, type Stop } from './fixture';
import {
	type ActionDraft,
	ActionFields,
	actionProgress,
	completeWithoutRecord,
	emptyAction,
	emptyInspection,
	emptyTrap,
	inspectionProgress,
	skipProgress,
	type TrapDraft,
	TrapFields,
	trapProgress,
} from './forms';
import { CompletePrompt, FakeMap, History, OpsList, SkipSheet } from './shared';
import { type Progress, useStore } from './store';
import {
	Btn,
	Chips,
	c,
	Field,
	Header,
	MultiChips,
	Sheet,
	Stepper,
	s,
	Tap,
	Toast,
	Toggle,
} from './ui';

export const nameC = 'Map and outcomes';

type Open = null | 'skip' | 'larvae' | 'trap' | 'action' | 'details';

export function VariantC() {
	const store = useStore();
	const [run, setRun] = useState<Run | null>(null);
	const [stop, setStop] = useState<Stop | null>(null);
	const [open, setOpen] = useState<Open>(null);
	const [toast, setToast] = useState<{ text: string; token: number; stop: Stop } | null>(null);
	const [prompt, setPrompt] = useState<Run | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const select = (st: Stop) => {
		store.openStop(st);
		setStop(st);
	};

	if (!run || !stop) {
		return (
			<View style={s.fill}>
				<OpsList
					onOpen={(r) => {
						setRun(r);
						select(store.nextPending(r) ?? r.stops[0]!);
					}}
				/>
				<View style={{ height: 64 }} />
			</View>
		);
	}

	const commit = (p: Progress) => {
		setOpen(null);
		const token = store.progress(run, stop, p);
		const next = store.nextPending(run, stop);
		if (timer.current) clearTimeout(timer.current);
		setToast({ text: `${p.outcome} saved`, token, stop });
		timer.current = setTimeout(() => setToast(null), 5000);
		if (next) select(next);
		else setPrompt(run);
	};

	const st = store.stopState(stop.id);
	const pending = store.trapPending[stop.id] ?? false;
	const editable = run.mine && st.status === 'pending';
	const n = store.stopNumber(run, stop);

	const outcomes = () => {
		if (!run.mine)
			return <Text style={s.muted}>{run.owner}'s work. Ask a Manager to reassign it on web.</Text>;
		if (st.status === 'skipped')
			return (
				<Btn
					label={`Skipped · ${st.skipReason} · Unskip`}
					onPress={() => store.unskip(run, stop)}
				/>
			);
		if (st.status === 'done')
			return <Btn label="Done · Reopen stop" onPress={() => store.reopen(run, stop)} />;
		if (stop.kind === 'habitat') {
			return (
				<Grid>
					<Btn
						big
						label="Dry"
						tone="primary"
						onPress={() => commit(inspectionProgress({ ...emptyInspection(), wet: false }))}
					/>
					<Btn
						big
						label="Wet, no larvae"
						tone="primary"
						onPress={() =>
							commit(inspectionProgress({ ...emptyInspection(), wet: true, density: 'none' }))
						}
					/>
					<Btn big label="Larvae found…" onPress={() => setOpen('larvae')} />
					<Btn big label="Skip…" onPress={() => setOpen('skip')} />
				</Grid>
			);
		}
		if (stop.kind === 'trap') {
			return pending ? (
				<Grid>
					<Btn
						big
						label="Collect and reset"
						tone="primary"
						sub={stop.trapConfig?.lure}
						onPress={() => commit(trapProgress('collect-reset', emptyTrap(stop)))}
					/>
					<Btn
						big
						label="Collect only"
						tone="primary"
						onPress={() => commit(trapProgress('collect', emptyTrap(stop)))}
					/>
					<Btn big label="Problem or changes…" onPress={() => setOpen('trap')} />
					<Btn big label="Skip…" onPress={() => setOpen('skip')} />
				</Grid>
			) : (
				<Grid>
					<Btn
						big
						label="Set"
						tone="primary"
						sub={`${stop.trapConfig?.method} · ${stop.trapConfig?.lure}`}
						onPress={() => commit(trapProgress('set', emptyTrap(stop)))}
					/>
					<Btn big label="Set differently…" onPress={() => setOpen('trap')} />
					<Btn big label="Skip…" onPress={() => setOpen('skip')} />
				</Grid>
			);
		}
		return (
			<Grid>
				<Btn
					big
					label="Done as requested"
					tone="primary"
					sub={`${stop.requested?.product} · ${stop.requested?.amount} ${stop.requested?.unit}`}
					onPress={() => commit(actionProgress(stop, emptyAction(stop)))}
				/>
				<Btn big label="Done differently…" onPress={() => setOpen('action')} />
				<Btn big label="Not done…" onPress={() => setOpen('skip')} />
			</Grid>
		);
	};

	return (
		<View style={s.fill}>
			<Header
				title={run.title}
				sub={`${run.stops.filter((x) => store.stopState(x.id).status !== 'pending').length} of ${run.stops.length} done`}
				onBack={() => {
					setRun(null);
					setStop(null);
				}}
			/>
			<FakeMap run={run} current={stop} onPick={select} />
			<View
				style={[
					s.card,
					{
						borderRadius: 0,
						borderTopLeftRadius: 16,
						borderTopRightRadius: 16,
						paddingBottom: 76,
						gap: 10,
					},
				]}
			>
				<Tap onPress={() => setOpen('details')}>
					<Text style={s.title} numberOfLines={1}>
						{n}. {stop.name}
					</Text>
					<Text style={s.muted} numberOfLines={1}>
						{stop.code} · {stop.distance} ·{' '}
						{pending && stop.pendingSince
							? stop.pendingSince
							: `last: ${st.records.at(-1) ?? stop.history[0]}`}
					</Text>
					{stop.notes ? (
						<Text style={[s.muted, { color: c.danger }]} numberOfLines={1}>
							{stop.notes}
						</Text>
					) : null}
					<Text style={{ color: c.accent, fontWeight: '600', marginTop: 4 }}>
						Details, history, comment ›
					</Text>
				</Tap>
				{outcomes()}
			</View>

			{open === 'skip' ? (
				<SkipSheet
					onClose={() => setOpen(null)}
					onPick={(reason) => commit(skipProgress(run, reason))}
				/>
			) : null}
			{open === 'larvae' ? <LarvaeSheet onClose={() => setOpen(null)} onSave={commit} /> : null}
			{open === 'trap' ? (
				<TrapSheet stop={stop} pending={pending} onClose={() => setOpen(null)} onSave={commit} />
			) : null}
			{open === 'action' ? (
				<ActionSheet stop={stop} onClose={() => setOpen(null)} onSave={commit} />
			) : null}
			{open === 'details' ? (
				<Sheet onClose={() => setOpen(null)}>
					<Text style={s.title}>{stop.name}</Text>
					<Text style={s.muted}>
						{stop.code} · {stop.detail}
					</Text>
					<History stop={stop} />
					{stop.directions ? <Text style={s.muted}>Directions: {stop.directions}</Text> : null}
					<Btn
						label="Comment"
						onPress={() => store.comment(stop, 'Standing water by the culvert')}
					/>
					<Btn label="Directions" onPress={() => {}} />
					{editable ? (
						<Btn label="Complete, no record" onPress={() => commit(completeWithoutRecord(run))} />
					) : null}
				</Sheet>
			) : null}
			{toast ? (
				<Toast
					text={toast.text}
					action={
						<Tap
							onPress={() => {
								store.undo(toast.token);
								select(toast.stop);
								setToast(null);
								setPrompt(null);
							}}
						>
							<Text style={{ color: '#9fe0b0', fontWeight: '700' }}>UNDO</Text>
						</Tap>
					}
				/>
			) : null}
			{prompt ? <CompletePrompt run={prompt} onDone={() => setPrompt(null)} /> : null}
		</View>
	);
}

function Grid({ children }: { readonly children: React.ReactNode }) {
	return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{wrap(children)}</View>;
}

function wrap(children: React.ReactNode) {
	return (Array.isArray(children) ? children : [children]).map((child, i) => (
		<View key={i} style={{ flexBasis: '48%', flexGrow: 1 }}>
			{child}
		</View>
	));
}

function LarvaeSheet({
	onClose,
	onSave,
}: {
	readonly onClose: () => void;
	readonly onSave: (p: Progress) => void;
}) {
	const [density, setDensity] = useState<(typeof DENSITIES)[number] | undefined>();
	const [stages, setStages] = useState<string[]>([]);
	const [dips, setDips] = useState(0);
	const [sample, setSample] = useState(false);
	return (
		<Sheet onClose={onClose}>
			<Text style={s.title}>Larvae found</Text>
			<ScrollView contentContainerStyle={{ gap: 14 }}>
				<Field label="Density">
					<Chips
						options={DENSITIES.filter((d) => d !== 'none')}
						value={density}
						onChange={setDensity}
					/>
				</Field>
				{density ? (
					<>
						<Field label="Life stages">
							<MultiChips options={STAGES} value={stages} onChange={setStages} />
						</Field>
						<Field label="Dips">
							<Stepper value={dips} onChange={setDips} />
						</Field>
						<Toggle label="Took a sample" value={sample} onChange={setSample} />
					</>
				) : null}
			</ScrollView>
			<Btn
				label={!density ? 'Pick a density' : stages.length === 0 ? 'Pick a life stage' : 'Save'}
				tone="primary"
				disabled={!density || stages.length === 0}
				onPress={() =>
					onSave(
						inspectionProgress({
							...emptyInspection(),
							wet: true,
							density: density!,
							stages,
							dips,
							sample,
						}),
					)
				}
			/>
		</Sheet>
	);
}

function TrapSheet({
	stop,
	pending,
	onClose,
	onSave,
}: {
	readonly stop: Stop;
	readonly pending: boolean;
	readonly onClose: () => void;
	readonly onSave: (p: Progress) => void;
}) {
	const [draft, setDraft] = useState<TrapDraft>(() => emptyTrap(stop));
	const [reset, setReset] = useState(true);
	const mode = !pending ? 'set' : reset ? 'collect-reset' : 'collect';
	return (
		<Sheet onClose={onClose}>
			<Text style={s.title}>{pending ? 'Collect' : 'Set'}</Text>
			<ScrollView contentContainerStyle={{ gap: 12 }}>
				{pending ? (
					<Toggle label="Reset after collecting" value={reset} onChange={setReset} />
				) : null}
				<TrapFields mode={mode} draft={draft} set={setDraft} />
			</ScrollView>
			<Btn label="Save" tone="primary" onPress={() => onSave(trapProgress(mode, draft))} />
		</Sheet>
	);
}

function ActionSheet({
	stop,
	onClose,
	onSave,
}: {
	readonly stop: Stop;
	readonly onClose: () => void;
	readonly onSave: (p: Progress) => void;
}) {
	const [draft, setDraft] = useState<ActionDraft>(() => emptyAction(stop));
	return (
		<Sheet onClose={onClose}>
			<Text style={s.title}>{stop.requested?.action}</Text>
			<ActionFields stop={stop} draft={draft} set={setDraft} />
			<Btn label="Save" tone="primary" onPress={() => onSave(actionProgress(stop, draft))} />
		</Sheet>
	);
}
