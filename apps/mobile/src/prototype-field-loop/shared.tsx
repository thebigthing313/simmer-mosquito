/**
 * PROTOTYPE, throwaway. The pieces every variant draws the same way: the Ops
 * list the loop starts from, the skip reason picker, the completion prompt and
 * a stand-in map. None of them is under question in #1338.
 */
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { RUNS, type Run, SKIP_REASONS, type Stop } from './fixture';
import { useStore } from './store';
import { Btn, Chips, c, Header, Sheet, StatusDot, s, Tap } from './ui';

export function OpsList({ onOpen }: { readonly onOpen: (run: Run) => void }) {
	const { runStatus, stopState } = useStore();
	const mine = RUNS.filter((r) => r.mine);
	const others = RUNS.filter((r) => !r.mine);
	const card = (run: Run) => {
		const done = run.stops.filter((st) => stopState(st.id).status !== 'pending').length;
		return (
			<Tap key={run.id} onPress={() => onOpen(run)} style={s.card}>
				<View style={s.row}>
					<Text style={[s.strong, { flex: 1 }]}>{run.title}</Text>
					<Text style={s.muted}>
						{done}/{run.stops.length}
					</Text>
				</View>
				<Text style={s.muted}>
					{run.subtitle} · {run.mine ? 'yours' : run.owner} ·{' '}
					{(runStatus[run.id] ?? 'not_started').replace('_', ' ')}
				</Text>
			</Tap>
		);
	};
	return (
		<View style={s.fill}>
			<Header title="Operations" />
			<ScrollView contentContainerStyle={s.pad}>
				<Text style={s.label}>Yours</Text>
				{mine.map(card)}
				<Text style={s.label}>Everyone else's</Text>
				{others.map(card)}
				<Btn label="Take a route" onPress={() => {}} tone="ghost" />
			</ScrollView>
		</View>
	);
}

export function SkipSheet({
	onPick,
	onClose,
}: {
	readonly onPick: (reason: string) => void;
	readonly onClose: () => void;
}) {
	const [typed, setTyped] = useState('');
	return (
		<Sheet onClose={onClose}>
			<Text style={s.title}>Skip this stop</Text>
			<Chips options={SKIP_REASONS} value={undefined} onChange={onPick} />
			<View style={s.row}>
				<TextInput
					value={typed}
					onChangeText={setTyped}
					placeholder="Other reason"
					style={{
						flex: 1,
						minHeight: 44,
						borderWidth: 1,
						borderColor: c.border,
						borderRadius: 8,
						padding: 10,
					}}
				/>
				<Btn label="Skip" disabled={!typed} onPress={() => onPick(typed)} />
			</View>
		</Sheet>
	);
}

export function CompletePrompt({
	run,
	onDone,
}: {
	readonly run: Run;
	readonly onDone: () => void;
}) {
	const { completeRun, stopState } = useStore();
	const skipped = run.stops.filter((st) => stopState(st.id).status === 'skipped').length;
	const noun = run.kind === 'assignment' ? 'assignment' : 'mission';
	return (
		<Sheet onClose={onDone}>
			<Text style={s.title}>Complete this {noun}?</Text>
			<Text style={s.body}>Every stop is done{skipped ? `, ${skipped} skipped` : ''}.</Text>
			<Btn
				label={`Complete ${noun}`}
				tone="primary"
				onPress={() => {
					completeRun(run);
					onDone();
				}}
			/>
			<Btn label="Not yet" onPress={onDone} />
		</Sheet>
	);
}

export function History({ stop }: { readonly stop: Stop }) {
	const { stopState } = useStore();
	const lines = [...stopState(stop.id).records].reverse().concat(stop.history);
	return (
		<View style={{ gap: 4 }}>
			{lines.slice(0, 3).map((l) => (
				<Text key={l} style={s.muted}>
					{l}
				</Text>
			))}
		</View>
	);
}

/** A stand-in for the map: a tinted box with the stops drawn as numbered pins. */
export function FakeMap({
	run,
	current,
	onPick,
}: {
	readonly run: Run;
	readonly current?: Stop;
	readonly onPick: (stop: Stop) => void;
}) {
	const { stopState } = useStore();
	return (
		<View style={{ flex: 1, backgroundColor: '#dfe8dc', overflow: 'hidden' }}>
			<View
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: '40%',
					height: 10,
					backgroundColor: '#f4f1e8',
				}}
			/>
			<View
				style={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: '55%',
					width: 10,
					backgroundColor: '#f4f1e8',
				}}
			/>
			<View
				style={{
					position: 'absolute',
					right: -40,
					bottom: -30,
					width: 180,
					height: 140,
					borderRadius: 90,
					backgroundColor: '#bcd3e0',
				}}
			/>
			{run.stops.map((st, i) => {
				const status = stopState(st.id).status;
				const on = current?.id === st.id;
				return (
					<Tap
						key={st.id}
						onPress={() => onPick(st)}
						style={{
							position: 'absolute',
							left: `${st.x * 86 + 4}%`,
							top: `${st.y * 80 + 4}%`,
							width: on ? 40 : 30,
							height: on ? 40 : 30,
							borderRadius: 20,
							alignItems: 'center',
							justifyContent: 'center',
							borderWidth: 2,
							borderColor: '#ffffff',
							backgroundColor:
								status === 'done'
									? c.textFaint
									: status === 'skipped'
										? c.border
										: on
											? c.accentPressed
											: c.accent,
						}}
					>
						<Text style={{ color: '#ffffff', fontWeight: '700' }}>
							{status === 'done' ? '✓' : i + 1}
						</Text>
					</Tap>
				);
			})}
			<View
				style={{
					position: 'absolute',
					left: '48%',
					top: '62%',
					width: 16,
					height: 16,
					borderRadius: 8,
					backgroundColor: '#2f6fed',
					borderWidth: 3,
					borderColor: '#ffffff',
				}}
			/>
		</View>
	);
}

export function StopRow({
	run,
	stop,
	onPress,
}: {
	readonly run: Run;
	readonly stop: Stop;
	readonly onPress: () => void;
}) {
	const { stopState, stopNumber } = useStore();
	const st = stopState(stop.id);
	return (
		<Tap
			onPress={onPress}
			style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
		>
			<StatusDot status={st.status} />
			<View style={{ flex: 1 }}>
				<Text style={s.strong} numberOfLines={1}>
					{stopNumber(run, stop)}. {stop.name}
				</Text>
				<Text style={s.muted} numberOfLines={1}>
					{st.status === 'skipped'
						? `Skipped · ${st.skipReason}`
						: st.status === 'done'
							? (st.records.at(-1) ?? 'Done')
							: `${stop.code} · ${stop.detail} · ${stop.distance}`}
				</Text>
			</View>
		</Tap>
	);
}
