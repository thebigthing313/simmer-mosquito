/**
 * PROTOTYPE, throwaway. The record fields for each stop type, and what each
 * outcome sends. Shared by the three variants, which differ in where these
 * fields appear and how many of them a Collector must touch.
 *
 * The inspection rules are the domain's, cut down: a dry source carries no
 * abundance, and breeding (any density but none) needs a life stage.
 */
import { Text, TextInput, View } from 'react-native';
import { DENSITIES, type Run, STAGES, type Stop } from './fixture';
import type { Progress } from './store';
import { Chips, c, Field, MultiChips, Stepper, s, Toggle } from './ui';

export type InspectionDraft = {
	wet?: boolean;
	dips: number;
	density?: (typeof DENSITIES)[number];
	stages: string[];
	sample: boolean;
	notes: string;
};

export const emptyInspection = (): InspectionDraft => ({
	dips: 0,
	stages: [],
	sample: false,
	notes: '',
});

export function inspectionProblem(d: InspectionDraft): string | null {
	if (d.wet === undefined) return 'Wet or dry?';
	if (!d.wet) return null;
	if (!d.density) return 'Pick a density';
	if (d.density !== 'none' && d.stages.length === 0) return 'Pick at least one life stage';
	return null;
}

export function inspectionProgress(d: InspectionDraft): Progress {
	const gist = !d.wet
		? 'Dry'
		: `Wet · ${d.density}${d.dips ? ` · ${d.dips} dips` : ''}${d.stages.length ? ` · ${d.stages.join(', ')}` : ''}`;
	const commands = [
		`fieldWork.recordHabitatInspectionForAssignmentItem { ${!d.wet ? 'isWet: false' : `isWet: true, density: ${d.density}, dipCount: ${d.dips || 'null'}, stages: [${d.stages.join(', ')}]`} }`,
	];
	if (d.sample) commands.push('larvalSurveillance.addInspectionSample { sampleId: <new> }');
	return {
		outcome: !d.wet
			? 'Dry inspection'
			: d.density === 'none'
				? 'Wet, no larvae'
				: `Larvae (${d.density})`,
		commands,
		record: `Today · ${gist} · you`,
		status: 'done',
	};
}

export function InspectionFields({
	draft,
	set,
}: {
	readonly draft: InspectionDraft;
	readonly set: (d: InspectionDraft) => void;
}) {
	return (
		<View style={{ gap: 16 }}>
			<Field label="Source">
				<Chips
					options={['Dry', 'Wet'] as const}
					value={draft.wet === undefined ? undefined : draft.wet ? 'Wet' : 'Dry'}
					onChange={(v) => set({ ...emptyInspection(), notes: draft.notes, wet: v === 'Wet' })}
				/>
			</Field>
			{draft.wet ? (
				<>
					<Field label="Density">
						<Chips
							options={DENSITIES}
							value={draft.density}
							onChange={(density) => set({ ...draft, density })}
						/>
					</Field>
					<Field label="Dips">
						<Stepper value={draft.dips} onChange={(dips) => set({ ...draft, dips })} />
					</Field>
					{draft.density && draft.density !== 'none' ? (
						<>
							<Field label="Life stages">
								<MultiChips
									options={STAGES}
									value={draft.stages}
									onChange={(stages) => set({ ...draft, stages })}
								/>
							</Field>
							<Toggle
								label="Took a sample"
								value={draft.sample}
								onChange={(sample) => set({ ...draft, sample })}
							/>
						</>
					) : null}
				</>
			) : null}
			<Field label="Notes">
				<TextInput
					value={draft.notes}
					onChangeText={(notes) => set({ ...draft, notes })}
					placeholder="Optional"
					style={{
						minHeight: 44,
						borderWidth: 1,
						borderColor: c.border,
						borderRadius: 8,
						padding: 10,
						backgroundColor: c.surface,
					}}
				/>
			</Field>
			<Text style={s.muted}>Additional personnel: none · add</Text>
		</View>
	);
}

export type TrapMode = 'set' | 'collect' | 'collect-reset';

export type TrapDraft = {
	zero: boolean;
	problem: boolean;
	bycatch: boolean;
	method: string;
	lure: string;
};

export const emptyTrap = (stop: Stop): TrapDraft => ({
	zero: false,
	problem: false,
	bycatch: false,
	method: stop.trapConfig?.method ?? '',
	lure: stop.trapConfig?.lure ?? '',
});

export function trapProgress(mode: TrapMode, d: TrapDraft): Progress {
	const flags = [d.zero && 'zero', d.problem && 'problem', d.bycatch && 'bycatch']
		.filter(Boolean)
		.join(', ');
	const collect = `fieldWork.collectTrapCollectionForAssignmentItem { ${flags ? `${flags}, ` : ''}completeAssignmentItem: ${mode === 'collect'} }`;
	const set = `fieldWork.setTrapCollectionForAssignmentItem { method: ${d.method}, lure: ${d.lure} }`;
	if (mode === 'set') {
		return {
			outcome: 'Set',
			commands: [set],
			record: 'Today · set · you',
			status: 'done',
			trapPending: true,
		};
	}
	if (mode === 'collect') {
		return {
			outcome: `Collect${flags ? ` (${flags})` : ''}`,
			commands: [collect],
			record: `Today · collected${flags ? ` · ${flags}` : ''} · you`,
			status: 'done',
			trapPending: false,
		};
	}
	return {
		outcome: `Collect and reset${flags ? ` (${flags})` : ''}`,
		commands: [collect, set],
		record: `Today · collected${flags ? ` · ${flags}` : ''} and reset · you`,
		status: 'done',
		trapPending: true,
	};
}

export function TrapFields({
	mode,
	draft,
	set,
}: {
	readonly mode: TrapMode;
	readonly draft: TrapDraft;
	readonly set: (d: TrapDraft) => void;
}) {
	return (
		<View style={{ gap: 12 }}>
			{mode !== 'set' ? (
				<>
					<Text style={s.label}>Collect</Text>
					<Toggle
						label="Nothing caught"
						value={draft.zero}
						onChange={(zero) => set({ ...draft, zero })}
					/>
					<Toggle
						label="Trap problem"
						value={draft.problem}
						onChange={(problem) => set({ ...draft, problem })}
					/>
					<Toggle
						label="Bycatch"
						value={draft.bycatch}
						onChange={(bycatch) => set({ ...draft, bycatch })}
					/>
				</>
			) : null}
			{mode !== 'collect' ? (
				<>
					<Text style={s.label}>{mode === 'set' ? 'Set' : 'Reset with'}</Text>
					<Field label="Method">
						<Chips
							options={['CDC light trap', 'Gravid trap', 'BG-Sentinel']}
							value={draft.method}
							onChange={(method) => set({ ...draft, method })}
						/>
					</Field>
					<Field label="Lure">
						<Chips
							options={['CO₂ (dry ice)', 'Hay infusion', 'BG-Lure', 'None']}
							value={draft.lure}
							onChange={(lure) => set({ ...draft, lure })}
						/>
					</Field>
				</>
			) : null}
			<Text style={s.muted}>Species are identified later, in the lab, on web.</Text>
		</View>
	);
}

export type ActionDraft = { product: string; amount: number; notes: string };

export const emptyAction = (stop: Stop): ActionDraft => ({
	product: stop.requested?.product ?? '',
	amount: stop.requested?.amount ?? 0,
	notes: '',
});

const actionCommand: Record<string, string> = {
	'Chemical application': 'missionDispatch.recordChemicalApplicationForMissionItem',
	'Source reduction': 'missionDispatch.recordSourceReductionForMissionItem',
};

export function actionProgress(stop: Stop, d: ActionDraft): Progress {
	const r = stop.requested;
	const name = r?.action ?? 'Chemical application';
	const asRequested = r && d.product === r.product && d.amount === r.amount;
	return {
		outcome: asRequested ? `${name}, as requested` : `${name}, changed`,
		commands: [`${actionCommand[name]} { ${d.product}, ${d.amount} ${r?.unit ?? ''} }`],
		record: `Today · ${name} · ${d.product} · ${d.amount} ${r?.unit ?? ''} · you`,
		status: 'done',
	};
}

export function ActionFields({
	stop,
	draft,
	set,
}: {
	readonly stop: Stop;
	readonly draft: ActionDraft;
	readonly set: (d: ActionDraft) => void;
}) {
	const r = stop.requested;
	return (
		<View style={{ gap: 16 }}>
			<Field label={r?.action === 'Source reduction' ? 'Work done' : 'Product'}>
				<Chips
					options={
						r?.action === 'Source reduction'
							? ['Containers emptied', 'Tires removed', 'Drained']
							: ['Altosid XR briquets', 'VectoBac G', 'Natular 2EC']
					}
					value={draft.product}
					onChange={(product) => set({ ...draft, product })}
				/>
			</Field>
			<Field label={`Amount (${r?.unit ?? ''})`}>
				<Stepper
					value={draft.amount}
					step={r?.unit === 'lb' ? 0.5 : 1}
					onChange={(amount) => set({ ...draft, amount })}
				/>
			</Field>
			<Text style={s.muted}>Applicator: you · vehicle and equipment from your last record</Text>
		</View>
	);
}

export function skipProgress(run: Run, reason: string): Progress {
	const ns =
		run.kind === 'assignment' ? 'fieldWork.skipAssignmentItem' : 'missionDispatch.skipMissionItem';
	return {
		outcome: `Skip (${reason})`,
		commands: [`${ns} { reason: "${reason}" }`],
		status: 'skipped',
		skipReason: reason,
	};
}

export function completeWithoutRecord(run: Run): Progress {
	const ns =
		run.kind === 'assignment'
			? 'fieldWork.completeAssignmentItem'
			: 'missionDispatch.completeMissionItem';
	return {
		outcome: 'Complete without record',
		commands: [ns],
		status: 'done',
		record: 'Today · completed, no record · you',
	};
}
