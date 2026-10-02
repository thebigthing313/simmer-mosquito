/**
 * PROTOTYPE, throwaway. The pieces all three variants share (#1348): the tab
 * bar, the map, record lists and screens with their markers, the Refused
 * command screen with edit and resend and discard, the sync list's sections,
 * the menu, the Organization picker, the Track pill and the two sign-in states.
 * The variants differ in where the sync state lives and how it is badged.
 */
import { type ReactNode, useState } from 'react';
import {
	Pressable,
	ScrollView,
	type StyleProp,
	Text,
	TextInput,
	View,
	type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, s } from '../prototype-field-loop/ui';
import {
	type Attention,
	attentionOf,
	type Cmd,
	type Download,
	fmtTrack,
	ME,
	ORGS,
	type Rec,
	type Tab,
	useModel,
} from './model';

export const amber = '#b45309';
export const amberSurface = '#fef3c7';
export const redSurface = '#fde8e8';
export const blue = '#1d4ed8';

export function B({
	label,
	onPress,
	tone = 'secondary',
	disabled,
	style,
	sub,
}: {
	readonly label: string;
	readonly onPress: () => void;
	readonly tone?: 'primary' | 'secondary' | 'ghost' | 'danger';
	readonly disabled?: boolean | undefined;
	readonly style?: StyleProp<ViewStyle>;
	readonly sub?: string | undefined;
}) {
	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				s.btn,
				s[tone],
				style,
				pressed && { opacity: 0.6 },
				disabled && { opacity: 0.4 },
			]}
		>
			<Text style={[s.btnLabel, tone === 'primary' || tone === 'danger' ? s.onAccent : null]}>
				{label}
			</Text>
			{sub ? <Text style={[s.btnSub, tone === 'primary' ? s.onAccent : null]}>{sub}</Text> : null}
		</Pressable>
	);
}

export function TopBar({
	title,
	sub,
	left,
	right,
	onBack,
}: {
	readonly title: string;
	readonly sub?: string | undefined;
	readonly left?: ReactNode;
	readonly right?: ReactNode;
	readonly onBack?: (() => void) | undefined;
}) {
	const insets = useSafeAreaInsets();
	return (
		<View style={[s.header, { paddingTop: insets.top + 8 }]}>
			{onBack ? (
				<Pressable onPress={onBack} style={s.back}>
					<Text style={s.backGlyph}>‹</Text>
				</Pressable>
			) : null}
			{left}
			<View style={{ flex: 1 }}>
				<Text style={s.title} numberOfLines={1}>
					{title}
				</Text>
				{sub ? (
					<Text style={s.muted} numberOfLines={1}>
						{sub}
					</Text>
				) : null}
			</View>
			{right}
		</View>
	);
}

export function Badge({
	n,
	tone = 'red',
}: {
	readonly n?: number | undefined;
	readonly tone?: 'red' | 'amber' | 'grey';
}) {
	const bg = tone === 'red' ? c.danger : tone === 'amber' ? amber : c.textFaint;
	return (
		<View
			style={{
				position: 'absolute',
				top: -4,
				right: -6,
				minWidth: n === undefined ? 12 : 18,
				height: n === undefined ? 12 : 18,
				borderRadius: 9,
				backgroundColor: bg,
				borderWidth: 2,
				borderColor: '#fff',
				alignItems: 'center',
				justifyContent: 'center',
				paddingHorizontal: 3,
			}}
		>
			{n !== undefined ? (
				<Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{n}</Text>
			) : null}
		</View>
	);
}

export function Avatar({
	onPress,
	badge,
}: {
	readonly onPress: () => void;
	readonly badge?: ReactNode;
}) {
	return (
		<Pressable onPress={onPress} style={{ width: 36, height: 36 }}>
			<View
				style={{
					width: 36,
					height: 36,
					borderRadius: 18,
					backgroundColor: c.accent,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<Text style={{ color: '#fff', fontWeight: '700' }}>{ME.initials}</Text>
			</View>
			{badge}
		</Pressable>
	);
}

const TABS: readonly { key: Tab; label: string }[] = [
	{ key: 'map', label: 'Map' },
	{ key: 'larval', label: 'Larval' },
	{ key: 'adult', label: 'Adult' },
	{ key: 'control', label: 'Control' },
	{ key: 'ops', label: 'Ops' },
];

export function TabBar({
	tab,
	onTab,
	badges,
}: {
	readonly tab: Tab;
	readonly onTab: (t: Tab) => void;
	readonly badges?: Partial<Record<Tab, number>>;
}) {
	const insets = useSafeAreaInsets();
	return (
		<View style={[s.bar, { paddingBottom: insets.bottom + 52, paddingTop: 6, gap: 0 }]}>
			{TABS.map((t) => (
				<Pressable
					key={t.key}
					onPress={() => onTab(t.key)}
					style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}
				>
					<View>
						<Text style={{ fontSize: 18, color: tab === t.key ? c.accent : c.textFaint }}>
							{t.key === 'map'
								? '◎'
								: t.key === 'larval'
									? '≈'
									: t.key === 'adult'
										? '✦'
										: t.key === 'control'
											? '◆'
											: '☰'}
						</Text>
						{badges?.[t.key] ? <Badge n={badges[t.key]} /> : null}
					</View>
					<Text
						style={{
							fontSize: 11,
							color: tab === t.key ? c.accent : c.textMuted,
							fontWeight: '600',
						}}
					>
						{t.label}
					</Text>
				</Pressable>
			))}
		</View>
	);
}

// --- markers ---------------------------------------------------------------

export function attentionText(cmd: Cmd, a: Attention): string {
	switch (a) {
		case 'refused':
			return `Not accepted. ${cmd.reason ?? ''}`;
		case 'held':
			return 'Waiting on a change that was not accepted.';
		case 'stuck':
			return `The server has not answered ${cmd.attempts} tries. It keeps trying.`;
		case 'old':
			return `Saved ${cmd.ageDays} days ago. Send it before 90 days or it could be recorded twice.`;
		case 'window':
			return `Corrections to this record close in ${cmd.windowDaysLeft} days. It has to reach the server by then.`;
	}
}

/** The chip on a record's row in a list. */
export function StatusChip({ cmd }: { readonly cmd: Cmd | undefined }) {
	if (!cmd) return null;
	const a = attentionOf(cmd);
	const [label, fg, bg] =
		a === 'refused'
			? ['Not sent', c.danger, redSurface]
			: a === 'held' || a === 'stuck'
				? ['Not sent', amber, amberSurface]
				: a === 'old' || a === 'window'
					? ['Waiting ⚠', amber, amberSurface]
					: cmd.status === 'undo'
						? ['Saving…', c.textMuted, c.fieldBackground]
						: ['Waiting', c.textMuted, c.fieldBackground];
	return (
		<View
			style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}
		>
			<Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
		</View>
	);
}

/** The banner at the top of a record's screen. */
export function RecordBanner({
	cmd,
	onReview,
}: {
	readonly cmd: Cmd | undefined;
	readonly onReview: () => void;
}) {
	const { online, data } = useModel();
	if (!cmd) return null;
	const a = attentionOf(cmd);
	const tone = a === 'refused' ? 'red' : a ? 'amber' : 'grey';
	const text = a
		? attentionText(cmd, a)
		: online
			? 'Sending…'
			: `Saved on this phone at ${cmd.savedAt}. It sends when you are back online.`;
	return (
		<View
			style={{
				backgroundColor:
					tone === 'red' ? redSurface : tone === 'amber' ? amberSurface : c.fieldBackground,
				padding: 12,
				gap: 8,
			}}
		>
			<Text
				style={{
					color: tone === 'red' ? c.danger : tone === 'amber' ? amber : c.text,
					fontSize: 14,
				}}
			>
				{text}
			</Text>
			{a === 'refused' || a === 'held' ? (
				<B
					label={a === 'refused' ? 'Review' : 'See what it waits on'}
					onPress={onReview}
					style={{ minHeight: 40 }}
				/>
			) : null}
			{a === 'held' ? (
				<Text style={s.muted}>
					Waiting on: {data.cmds.find((x) => x.id === cmd.heldBehind)?.summary}
				</Text>
			) : null}
		</View>
	);
}

// --- map -------------------------------------------------------------------

const PINS: readonly { code: string; recordId: string; x: number; y: number; kind: 'h' | 't' }[] = [
	{ code: '0142', recordId: 'r1', x: 0.22, y: 0.32, kind: 'h' },
	{ code: '0188', recordId: 'r5', x: 0.62, y: 0.22, kind: 'h' },
	{ code: '021', recordId: 'r3', x: 0.42, y: 0.58, kind: 't' },
	{ code: '0177', recordId: 'r4', x: 0.78, y: 0.66, kind: 'h' },
	{ code: '0151', recordId: '', x: 0.12, y: 0.7, kind: 'h' },
];

export function HomeMap({
	onPin,
	children,
}: {
	readonly onPin: (recordId: string) => void;
	readonly children?: ReactNode;
}) {
	const { cmdFor } = useModel();
	return (
		<View style={{ flex: 1, backgroundColor: '#dfe8dc', overflow: 'hidden' }}>
			<View
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: '45%',
					height: 10,
					backgroundColor: '#f4f1e8',
				}}
			/>
			<View
				style={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: '52%',
					width: 10,
					backgroundColor: '#f4f1e8',
				}}
			/>
			{PINS.map((p) => {
				const cmd = p.recordId ? cmdFor(p.recordId) : undefined;
				const a = cmd ? attentionOf(cmd) : null;
				return (
					<Pressable
						key={p.code}
						onPress={() => p.recordId && onPin(p.recordId)}
						style={{
							position: 'absolute',
							left: `${p.x * 86}%`,
							top: `${p.y * 80 + 6}%`,
							alignItems: 'center',
						}}
					>
						<View
							style={{
								width: 30,
								height: 30,
								borderRadius: p.kind === 'h' ? 15 : 4,
								backgroundColor: p.kind === 'h' ? '#2f6f4f' : '#7c3aed',
								borderWidth: 3,
								borderColor: p.recordId ? '#facc15' : '#fff',
							}}
						/>
						{cmd ? <Badge tone={a === 'refused' ? 'red' : a ? 'amber' : 'grey'} /> : null}
						<Text style={{ fontSize: 10, fontWeight: '700', color: '#333' }}>{p.code}</Text>
					</Pressable>
				);
			})}
			<Text style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 10, color: '#555' }}>
				Yellow ring: visited today. Dot: a change on this phone not yet sent.
			</Text>
			{children}
		</View>
	);
}

export function RecordFab({ onPress }: { readonly onPress: () => void }) {
	return (
		<Pressable
			onPress={onPress}
			style={{
				position: 'absolute',
				right: 16,
				bottom: 16,
				backgroundColor: c.accent,
				borderRadius: 28,
				paddingHorizontal: 20,
				height: 56,
				justifyContent: 'center',
				elevation: 4,
			}}
		>
			<Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>＋ Record</Text>
		</Pressable>
	);
}

// --- lists and records -----------------------------------------------------

export function RecordList({
	tab,
	onOpen,
	only,
}: {
	readonly tab: Exclude<Tab, 'map'>;
	readonly onOpen: (r: Rec) => void;
	readonly only?: ((r: Rec) => boolean) | undefined;
}) {
	const { data, cmdFor } = useModel();
	const rows = data.records.filter((r) => r.tab === tab && (only ? only(r) : true));
	return (
		<ScrollView contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}>
			{rows.length === 0 ? <Text style={s.muted}>Nothing here.</Text> : null}
			{rows.map((r) => (
				<Pressable key={r.id} onPress={() => onOpen(r)} style={[s.card, s.row]}>
					<View style={{ flex: 1 }}>
						<Text style={s.label}>{r.type}</Text>
						<Text style={s.strong} numberOfLines={1}>
							{r.title}
						</Text>
						<Text style={s.muted}>{r.sub}</Text>
					</View>
					<StatusChip cmd={cmdFor(r.id)} />
				</Pressable>
			))}
		</ScrollView>
	);
}

export function RecordBody({
	id,
	onReview,
}: {
	readonly id: string;
	readonly onReview: (cmd: Cmd) => void;
}) {
	const { data, cmdFor } = useModel();
	const r = data.records.find((x) => x.id === id);
	const cmd = cmdFor(id);
	if (!r) return <Text style={[s.muted, { padding: 16 }]}>This record was discarded.</Text>;
	return (
		<ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
			<RecordBanner cmd={cmd} onReview={() => cmd && onReview(cmd)} />
			<View style={s.pad}>
				{r.fields.map(([k, v]) => (
					<View key={k}>
						<Text style={s.label}>{k}</Text>
						<Text style={s.body}>{v}</Text>
					</View>
				))}
				<View style={[s.row, { marginTop: 8 }]}>
					<B label="Edit" onPress={() => {}} style={{ flex: 1 }} />
					<B label="Comment" onPress={() => {}} style={{ flex: 1 }} />
				</View>
			</View>
		</ScrollView>
	);
}

// --- a Refused command -----------------------------------------------------

export function RefusedBody({
	cmd,
	onEdit,
	onDone,
}: {
	readonly cmd: Cmd;
	readonly onEdit: () => void;
	readonly onDone: () => void;
}) {
	const m = useModel();
	const [confirm, setConfirm] = useState(false);
	const held = m.heldBy(cmd);
	const rec = m.data.records.find((r) => r.id === cmd.recordId);
	return (
		<View style={{ flex: 1 }}>
			<ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]}>
				<View style={{ backgroundColor: redSurface, borderRadius: 12, padding: 14, gap: 6 }}>
					<Text style={[s.label, { color: c.danger }]}>The server did not accept this</Text>
					<Text style={[s.body, { fontSize: 16 }]}>{cmd.reason}</Text>
				</View>
				<View style={s.card}>
					<Text style={s.label}>What you saved</Text>
					<Text style={s.strong}>{cmd.summary}</Text>
					<Text style={s.muted}>
						Saved {cmd.savedAt} · still shown on this phone, marked Not sent
					</Text>
					{rec ? <Text style={s.muted}>{rec.sub}</Text> : null}
				</View>
				{held.length > 0 ? (
					<View style={s.card}>
						<Text style={s.label}>Held behind it ({held.length})</Text>
						{held.map((h) => (
							<Text key={h.id} style={s.body}>
								· {h.summary}
							</Text>
						))}
						<Text style={s.muted}>
							These send once this is fixed. Everything else keeps sending.
						</Text>
					</View>
				) : null}
				<B label="Edit and resend" tone="primary" onPress={onEdit} />
				<B
					label="Discard"
					tone="ghost"
					onPress={() => setConfirm(true)}
					style={{ borderWidth: 1, borderColor: c.danger }}
				/>
				<Text style={[s.muted, { fontSize: 11 }]}>
					{cmd.command} · HTTP {cmd.httpStatus}
				</Text>
			</ScrollView>
			{confirm ? (
				<Confirm
					title={held.length ? `Discard ${held.length + 1} changes?` : 'Discard this change?'}
					body={
						held.length
							? `${cmd.summary}, and what depends on it:\n${held.map((h) => `· ${h.summary}`).join('\n')}\n\nThey come off this phone and are never sent.`
							: `${cmd.summary} comes off this phone and is never sent.`
					}
					ok={held.length ? `Discard ${held.length + 1}` : 'Discard'}
					danger
					onOk={() => {
						m.discard(cmd.id);
						onDone();
					}}
					onCancel={() => setConfirm(false)}
				/>
			) : null}
		</View>
	);
}

/** Edit and resend: the record's form filled from the command. */
export function EditBody({ cmd, onDone }: { readonly cmd: Cmd; readonly onDone: () => void }) {
	const m = useModel();
	const [habitat, setHabitat] = useState('HAB-0142 · Roadside ditch, Elm St (inactive)');
	return (
		<ScrollView contentContainerStyle={s.pad}>
			<View style={{ backgroundColor: redSurface, borderRadius: 10, padding: 10 }}>
				<Text style={{ color: c.danger }}>{cmd.reason}</Text>
			</View>
			<Text style={s.label}>Habitat</Text>
			{[
				'HAB-0142 · Roadside ditch, Elm St (inactive)',
				'HAB-0143 · Roadside ditch, Elm St (south)',
			].map((h) => (
				<Pressable
					key={h}
					onPress={() => setHabitat(h)}
					style={[s.card, habitat === h && { borderColor: c.accent, borderWidth: 2 }]}
				>
					<Text style={s.body}>{h}</Text>
				</Pressable>
			))}
			<Text style={s.label}>Water</Text>
			<Text style={s.body}>Wet</Text>
			<Text style={s.label}>Density · Dips</Text>
			<Text style={s.body}>Light · 12</Text>
			<B
				label="Save and resend"
				tone="primary"
				disabled={habitat.includes('inactive')}
				onPress={() => {
					m.resend(cmd.id, 'Inspection at HAB-0143');
					onDone();
				}}
			/>
			<Text style={s.muted}>
				Saving puts it back in its place in the queue and releases what was held behind it.
			</Text>
		</ScrollView>
	);
}

// --- the sync list's sections ----------------------------------------------

export function Progress({ d }: { readonly d: Download }) {
	const m = useModel();
	const done = d.done >= d.total;
	const paused = !done && (m.network === 'offline' || (m.network === 'cellular' && !m.cellularOk));
	return (
		<View style={{ gap: 4 }}>
			<View style={[s.row, { justifyContent: 'space-between' }]}>
				<Text style={s.strong}>{d.label}</Text>
				<Text style={s.muted}>
					{done
						? 'Done'
						: `${d.done.toLocaleString('en-US')} of ${d.total.toLocaleString('en-US')} ${d.unit}`}
				</Text>
			</View>
			<View style={{ height: 6, backgroundColor: c.fieldBackground, borderRadius: 3 }}>
				<View
					style={{
						height: 6,
						width: `${Math.round((d.done / d.total) * 100)}%`,
						backgroundColor: done ? c.accent : paused ? c.textFaint : blue,
						borderRadius: 3,
					}}
				/>
			</View>
			{paused ? (
				<Text style={s.muted}>
					{m.network === 'offline' ? 'Paused while offline.' : 'Waiting for Wi-Fi.'}
				</Text>
			) : null}
		</View>
	);
}

export function Downloads() {
	const m = useModel();
	const waitingWifi =
		m.network === 'cellular' &&
		!m.cellularOk &&
		(m.history.done < m.history.total || m.basemap.done < m.basemap.total);
	return (
		<View style={{ gap: 12 }}>
			<Progress d={m.history} />
			<Progress d={m.basemap} />
			{waitingWifi ? <B label="Download now on cellular" onPress={m.allowCellular} /> : null}
		</View>
	);
}

export function Freshness() {
	const m = useModel();
	return (
		<View style={{ gap: 2 }}>
			<Text style={s.strong}>
				{m.online
					? m.session === 'ok'
						? 'Online, up to date'
						: 'Online, not signed in'
					: 'Offline'}
			</Text>
			<Text style={s.muted}>
				{m.online
					? `Last synced ${m.data.lastSynced}`
					: `Data on this phone is from ${m.data.lastSynced}.`}
			</Text>
			{!m.online ? <Text style={s.muted}>Session last confirmed {m.sessionConfirmed}.</Text> : null}
		</View>
	);
}

export function CmdRow({ cmd, onOpen }: { readonly cmd: Cmd; readonly onOpen: (c: Cmd) => void }) {
	const a = attentionOf(cmd);
	return (
		<Pressable onPress={() => onOpen(cmd)} style={[s.card, { gap: 4 }]}>
			<View style={[s.row, { justifyContent: 'space-between' }]}>
				<Text style={[s.strong, { flex: 1 }]} numberOfLines={1}>
					{cmd.summary}
				</Text>
				<StatusChip cmd={cmd} />
			</View>
			<Text style={{ color: a === 'refused' ? c.danger : a ? amber : c.textMuted, fontSize: 13 }}>
				{a ? attentionText(cmd, a) : `Saved ${cmd.savedAt}`}
			</Text>
		</Pressable>
	);
}

export function AttentionList({ onOpen }: { readonly onOpen: (c: Cmd) => void }) {
	const { attention } = useModel();
	if (attention.length === 0) return <Text style={s.muted}>Nothing needs you.</Text>;
	return (
		<View style={{ gap: 8 }}>
			{attention.map((x) => (
				<CmdRow key={x.id} cmd={x} onOpen={onOpen} />
			))}
		</View>
	);
}

export function WaitingList({ onOpen }: { readonly onOpen: (c: Cmd) => void }) {
	const { waiting, attention } = useModel();
	const plain = waiting.filter((w) => !attention.includes(w));
	if (plain.length === 0) return <Text style={s.muted}>Every change is sent.</Text>;
	return (
		<View style={{ gap: 8 }}>
			{plain.map((x) => (
				<CmdRow key={x.id} cmd={x} onOpen={onOpen} />
			))}
		</View>
	);
}

export function Section({
	title,
	children,
}: {
	readonly title: string;
	readonly children: ReactNode;
}) {
	return (
		<View style={{ gap: 8 }}>
			<Text style={s.label}>{title}</Text>
			{children}
		</View>
	);
}

// --- menu, picker, confirm -------------------------------------------------

export function Confirm({
	title,
	body,
	ok,
	danger,
	onOk,
	onCancel,
}: {
	readonly title: string;
	readonly body: string;
	readonly ok: string;
	readonly danger?: boolean;
	readonly onOk: () => void;
	readonly onCancel: () => void;
}) {
	return (
		<View style={[s.scrim, { justifyContent: 'center', padding: 24, zIndex: 40 }]}>
			<View style={[s.card, { padding: 18, gap: 12 }]}>
				<Text style={s.title}>{title}</Text>
				<Text style={s.body}>{body}</Text>
				<View style={[s.row, { justifyContent: 'flex-end' }]}>
					<B label="Cancel" tone="ghost" onPress={onCancel} />
					<B label={ok} tone={danger ? 'danger' : 'primary'} onPress={onOk} />
				</View>
			</View>
		</View>
	);
}

export function SheetFrame({
	children,
	onClose,
}: {
	readonly children: ReactNode;
	readonly onClose: () => void;
}) {
	const insets = useSafeAreaInsets();
	return (
		<View style={s.scrim}>
			<Pressable style={{ flex: 1 }} onPress={onClose} />
			<View style={[s.sheet, { paddingBottom: insets.bottom + 60 }]}>{children}</View>
		</View>
	);
}

type MenuStep = 'menu' | 'picker' | { switchTo: string } | 'signout' | 'track';

/**
 * The avatar's menu. `syncRow` is the variant's own entry for sync status, or
 * null when the variant puts it elsewhere.
 */
export function MenuSheet({
	onClose,
	syncRow,
}: {
	readonly onClose: () => void;
	readonly syncRow: ReactNode;
}) {
	const m = useModel();
	const [step, setStep] = useState<MenuStep>('menu');
	const unsent = m.data.cmds.length;
	const unsentAfterSend = m.attention.length;

	if (step === 'track')
		return (
			<Confirm
				title="Finish or discard the Track first"
				body="A Track is recording. Switching Organization or signing out would lose it."
				ok="OK"
				onOk={() => setStep('menu')}
				onCancel={() => setStep('menu')}
			/>
		);
	if (step === 'signout')
		return (
			<Confirm
				title="Sign out?"
				body={`${unsent} changes have not been sent. They stay on this phone and send when you sign in again.`}
				ok="Sign out"
				onOk={() => {
					m.signOut();
					onClose();
				}}
				onCancel={() => setStep('menu')}
			/>
		);
	if (typeof step === 'object')
		return (
			<Confirm
				title={`Switch to ${step.switchTo}?`}
				body={`${unsentAfterSend} changes in ${m.org} have not been sent. They will send when you switch back.`}
				ok="Switch anyway"
				onOk={() => {
					m.switchOrg(step.switchTo);
					onClose();
				}}
				onCancel={() => setStep('picker')}
			/>
		);
	if (step === 'picker')
		return (
			<SheetFrame onClose={onClose}>
				<Text style={s.title}>Switch Organization</Text>
				{ORGS.map((o) => {
					const viewer = o.role === 'Viewer';
					const here = o.name === m.org;
					const n = m.unsentIn(o.name);
					return (
						<Pressable
							key={o.name}
							disabled={viewer || here}
							onPress={() =>
								unsentAfterSend > 0
									? setStep({ switchTo: o.name })
									: (m.switchOrg(o.name), onClose())
							}
							style={[s.card, s.row, (viewer || here) && { opacity: viewer ? 0.5 : 1 }]}
						>
							<View style={{ flex: 1 }}>
								<Text style={s.strong}>
									{o.name}
									{here ? ' · current' : ''}
								</Text>
								<Text style={s.muted}>{viewer ? 'Viewer, use SIMMER on the web.' : o.role}</Text>
							</View>
							{n > 0 && !here ? (
								<Text style={{ color: amber, fontWeight: '700' }}>{n} unsent</Text>
							) : null}
						</Pressable>
					);
				})}
				<Text style={s.muted}>Switching sends {m.org}'s waiting changes first.</Text>
			</SheetFrame>
		);

	return (
		<SheetFrame onClose={onClose}>
			<View style={s.row}>
				<Avatar onPress={() => {}} />
				<View>
					<Text style={s.strong}>{ME.name}</Text>
					<Text style={s.muted}>{m.org} · Collector</Text>
				</View>
			</View>
			{!m.online ? (
				<Text style={s.muted}>Offline · session last confirmed {m.sessionConfirmed}</Text>
			) : null}
			{syncRow}
			<MenuItem label="Profile" />
			<MenuItem
				label="Switch Organization"
				sub={m.online ? undefined : 'Connect to switch Organization.'}
				disabled={!m.online}
				onPress={() => (m.track ? setStep('track') : setStep('picker'))}
			/>
			<MenuItem label="Addresses" />
			<MenuItem label="SIMMER Field 0.1.0 · Changelog" />
			<MenuItem
				label="Sign out"
				onPress={() =>
					m.track ? setStep('track') : unsent > 0 ? setStep('signout') : (m.signOut(), onClose())
				}
			/>
		</SheetFrame>
	);
}

export function MenuItem({
	label,
	sub,
	onPress,
	disabled,
	right,
}: {
	readonly label: string;
	readonly sub?: string | undefined;
	readonly onPress?: () => void;
	readonly disabled?: boolean;
	readonly right?: ReactNode;
}) {
	return (
		<Pressable
			disabled={disabled}
			onPress={onPress}
			style={[s.row, { minHeight: 44, opacity: disabled ? 0.5 : 1 }]}
		>
			<View style={{ flex: 1 }}>
				<Text style={s.body}>{label}</Text>
				{sub ? <Text style={s.muted}>{sub}</Text> : null}
			</View>
			{right}
		</Pressable>
	);
}

// --- Track, toast, sign-in -------------------------------------------------

/** The Track-in-progress pill. On the map it floats; elsewhere it is a bar under the status bar. */
export function TrackPill({ floating }: { readonly floating?: boolean }) {
	const m = useModel();
	if (!m.track) return null;
	const rec = m.track.state === 'recording';
	return (
		<View
			style={[
				{
					flexDirection: 'row',
					alignItems: 'center',
					gap: 10,
					backgroundColor: rec ? c.danger : amber,
					paddingHorizontal: 12,
					paddingVertical: 8,
				},
				floating && {
					position: 'absolute',
					top: 12,
					alignSelf: 'center',
					borderRadius: 20,
					zIndex: 5,
				},
			]}
		>
			<Text style={{ color: '#fff', fontWeight: '700' }}>
				{rec ? '● Recording Track' : '❚❚ Track paused'} {fmtTrack(m.track.seconds)}
			</Text>
			<Pressable onPress={m.trackPause}>
				<Text style={{ color: '#fff', textDecorationLine: 'underline' }}>
					{rec ? 'Pause' : 'Resume'}
				</Text>
			</Pressable>
			<Pressable onPress={m.trackFinish}>
				<Text style={{ color: '#fff', textDecorationLine: 'underline' }}>Finish</Text>
			</Pressable>
		</View>
	);
}

export function ToastBar() {
	const m = useModel();
	if (!m.toast) return null;
	const undo = m.data.cmds.some((x) => x.status === 'undo');
	return (
		<View style={[s.toast, { bottom: 130 }]}>
			<Text style={[s.onAccent, { flex: 1 }]}>{m.toast}</Text>
			{undo ? (
				<Pressable onPress={m.undo}>
					<Text style={{ color: '#86efac', fontWeight: '700' }}>Undo</Text>
				</Pressable>
			) : (
				<Pressable onPress={m.clearToast}>
					<Text style={{ color: '#fff' }}>✕</Text>
				</Pressable>
			)}
		</View>
	);
}

export function SignIn() {
	const m = useModel();
	const insets = useSafeAreaInsets();
	const waiting = m.data.cmds.length;
	return (
		<View style={[s.fill, { paddingTop: insets.top + 40, padding: 24, gap: 14 }]}>
			<Text style={[s.title, { fontSize: 26 }]}>SIMMER Field</Text>
			{m.session === 'dead' && waiting > 0 ? (
				<View style={{ backgroundColor: amberSurface, borderRadius: 10, padding: 12 }}>
					<Text style={{ color: amber }}>
						{waiting} changes from {ME.first} in {m.org} are waiting. Sign in as {ME.first} to send
						them.
					</Text>
				</View>
			) : null}
			<TextInput
				placeholder="Email"
				style={[s.card, { minHeight: 48 }]}
				defaultValue="dana@northfield.example"
			/>
			<TextInput
				placeholder="Password"
				secureTextEntry
				style={[s.card, { minHeight: 48 }]}
				defaultValue="xxxxxxxx"
			/>
			<B label="Sign in" tone="primary" onPress={m.signIn} />
		</View>
	);
}

export function ViewerRefusal({ onReview }: { readonly onReview: () => void }) {
	const m = useModel();
	const insets = useSafeAreaInsets();
	const n = m.data.cmds.length;
	return (
		<View style={[s.fill, { paddingTop: insets.top + 40, padding: 24, gap: 14 }]}>
			<Text style={s.title}>SIMMER Field is for Collectors and above</Text>
			<Text style={s.body}>Your role in {m.org} is Viewer, so use SIMMER on the web.</Text>
			{n > 0 ? (
				<View style={{ backgroundColor: amberSurface, borderRadius: 10, padding: 12, gap: 8 }}>
					<Text style={{ color: amber }}>
						{n} changes made as a Collector cannot be sent. Ask a Manager to restore your role, or
						discard them.
					</Text>
					<B label="Review changes" onPress={onReview} />
				</View>
			) : null}
			<B label="Switch Organization" onPress={() => {}} />
			<B label="Sign out" tone="ghost" onPress={m.signOut} />
		</View>
	);
}
