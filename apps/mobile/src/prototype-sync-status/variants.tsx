/**
 * PROTOTYPE, throwaway. Three answers to where the sync state lives (#1348).
 *
 * A, "In the menu": the avatar carries the badge and the sync status is a
 * screen behind the menu, as "Which screens the field app has" placed it.
 * B, "Status strip": a strip under the header on every screen says what the
 * queue is doing, and the tab that owns a refused record carries the count.
 * C, "Map chip and alert": a chip on the map opens a sheet with three tabs, a
 * refusal interrupts with an alert, and each list filters to what is not sent.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { c, s } from '../prototype-field-loop/ui';
import { attentionOf, type Cmd, type Tab, useModel } from './model';
import {
	AttentionList,
	Avatar,
	amber,
	amberSurface,
	B,
	Badge,
	blue,
	Downloads,
	EditBody,
	Freshness,
	HomeMap,
	MenuItem,
	MenuSheet,
	RecordBody,
	RecordFab,
	RecordList,
	RefusedBody,
	redSurface,
	Section,
	SheetFrame,
	SignIn,
	TabBar,
	ToastBar,
	TopBar,
	TrackPill,
	ViewerRefusal,
	WaitingList,
} from './shared';

type Route =
	| { readonly k: 'record'; readonly id: string }
	| { readonly k: 'refused'; readonly id: string }
	| { readonly k: 'edit'; readonly id: string }
	| { readonly k: 'sync' };

const TITLES: Record<Tab, string> = {
	map: 'Map',
	larval: 'Larval',
	adult: 'Adult',
	control: 'Control',
	ops: 'Operations',
};

function useNav() {
	const [stack, setStack] = useState<Route[]>([]);
	const [tab, setTab] = useState<Tab>('map');
	return {
		tab,
		setTab: (t: Tab) => {
			setStack([]);
			setTab(t);
		},
		top: stack[stack.length - 1],
		push: (r: Route) => setStack((x) => [...x, r]),
		pop: () => setStack((x) => x.slice(0, -1)),
		popTo: (n: number) => setStack((x) => x.slice(0, n)),
		depth: stack.length,
	};
}
type Nav = ReturnType<typeof useNav>;

/** Opening a command from a list: a refused one opens its review, anything else its record. */
function openCmd(nav: Nav, cmd: Cmd) {
	if (cmd.status === 'refused') nav.push({ k: 'refused', id: cmd.id });
	else nav.push({ k: 'record', id: cmd.recordId });
}

/** Record, Refused and Edit screens, the same in every variant bar the `status` slot. */
function Pushed({
	nav,
	status,
	right,
}: {
	readonly nav: Nav;
	readonly status?: ReactNode;
	readonly right?: ReactNode;
}) {
	const m = useModel();
	const r = nav.top;
	if (!r || r.k === 'sync') return null;
	const cmd = m.data.cmds.find((x) => x.id === r.id);
	const rec = r.k === 'record' ? m.data.records.find((x) => x.id === r.id) : undefined;
	const title =
		r.k === 'record'
			? (rec?.type ?? 'Record')
			: r.k === 'refused'
				? 'Not accepted'
				: 'Edit and resend';
	return (
		<View style={s.fill}>
			<TrackPill />
			<TopBar title={title} sub={rec?.title} onBack={nav.pop} right={right} />
			{status}
			{r.k === 'record' ? (
				<RecordBody
					id={r.id}
					onReview={(x) =>
						x.status === 'refused'
							? nav.push({ k: 'refused', id: x.id })
							: x.heldBehind
								? nav.push({ k: 'refused', id: x.heldBehind })
								: undefined
					}
				/>
			) : !cmd ? (
				<Text style={[s.muted, { padding: 16 }]}>Done.</Text>
			) : r.k === 'refused' ? (
				<RefusedBody
					cmd={cmd}
					onEdit={() => nav.push({ k: 'edit', id: cmd.id })}
					onDone={nav.pop}
				/>
			) : (
				<EditBody cmd={cmd} onDone={() => nav.popTo(Math.max(0, nav.depth - 2))} />
			)}
		</View>
	);
}

/** Sign-in and the Viewer refusal sit in front of every variant. */
function Gate({
	children,
	onReview,
}: {
	readonly children: ReactNode;
	readonly onReview: () => void;
}) {
	const m = useModel();
	if (m.signedOut) return <SignIn />;
	if (m.session === 'viewer') return <ViewerRefusal onReview={onReview} />;
	return <>{children}</>;
}

// =============================================================================
// A. In the menu
// =============================================================================

export const nameA = 'In the menu';

function useAvatarBadgeA() {
	const m = useModel();
	const hard = m.attention.filter((x) =>
		['refused', 'held', 'stuck'].includes(attentionOf(x) ?? ''),
	);
	if (hard.length) return <Badge n={hard.length} />;
	if (m.attention.length) return <Badge tone="amber" />;
	if (m.waiting.length && !m.online) return <Badge tone="grey" />;
	return null;
}

function SyncScreen({ nav, children }: { readonly nav: Nav; readonly children?: ReactNode }) {
	return (
		<View style={s.fill}>
			<TopBar title="Sync status" onBack={nav.pop} />
			{children}
			<ScrollView contentContainerStyle={[s.pad, { gap: 20, paddingBottom: 120 }]}>
				<Freshness />
				<Section title="Needs you">
					<AttentionList onOpen={(x) => openCmd(nav, x)} />
				</Section>
				<Section title="Waiting to send">
					<WaitingList onOpen={(x) => openCmd(nav, x)} />
				</Section>
				<Section title="Downloads">
					<Downloads />
				</Section>
			</ScrollView>
		</View>
	);
}

export function VariantA() {
	const m = useModel();
	const nav = useNav();
	const [menu, setMenu] = useState(false);
	const badge = useAvatarBadgeA();

	const body =
		nav.top?.k === 'sync' ? (
			<SyncScreen nav={nav} />
		) : nav.top ? (
			<Pushed nav={nav} />
		) : (
			<View style={s.fill}>
				{nav.tab === 'map' ? (
					<HomeMap onPin={(id) => nav.push({ k: 'record', id })}>
						<View style={{ position: 'absolute', top: 48, left: 12 }}>
							<Avatar onPress={() => setMenu(true)} badge={badge} />
						</View>
						<TrackPill floating />
						<RecordFab onPress={m.quickSave} />
					</HomeMap>
				) : (
					<>
						<TrackPill />
						<TopBar
							title={TITLES[nav.tab]}
							left={<Avatar onPress={() => setMenu(true)} badge={badge} />}
						/>
						<RecordList tab={nav.tab} onOpen={(r) => nav.push({ k: 'record', id: r.id })} />
					</>
				)}
				<TabBar tab={nav.tab} onTab={nav.setTab} />
			</View>
		);

	return (
		<Gate onReview={() => nav.push({ k: 'sync' })}>
			{body}
			<ToastBar />
			{menu ? (
				<MenuSheet
					onClose={() => setMenu(false)}
					syncRow={
						<Pressable
							onPress={() => {
								setMenu(false);
								nav.push({ k: 'sync' });
							}}
							style={[
								s.card,
								m.attention.length ? { backgroundColor: redSurface, borderColor: c.danger } : null,
							]}
						>
							<Text style={s.strong}>Sync status ›</Text>
							<Text style={s.muted}>
								{m.attention.length ? `${m.attention.length} need you · ` : ''}
								{m.waiting.length} waiting ·{' '}
								{m.online ? `synced ${m.data.lastSynced}` : `offline since ${m.data.lastSynced}`}
							</Text>
						</Pressable>
					}
				/>
			) : null}
		</Gate>
	);
}

// =============================================================================
// B. Status strip
// =============================================================================

export const nameB = 'Status strip';

function Strip({ onPress }: { readonly onPress: () => void }) {
	const m = useModel();
	const hard = m.attention.filter((x) =>
		['refused', 'held', 'stuck'].includes(attentionOf(x) ?? ''),
	);
	const pct = Math.round((m.history.done / m.history.total) * 100);
	const downloading = m.history.done < m.history.total || m.basemap.done < m.basemap.total;
	let text: string | null = null;
	let fg: string = c.textMuted;
	let bg: string = c.fieldBackground;
	if (hard.length) {
		text = `${hard.length} ${hard.length === 1 ? 'change' : 'changes'} not sent · Review`;
		fg = c.danger;
		bg = redSurface;
	} else if (m.attention.length) {
		text = `${m.attention.length} waiting with a deadline · Review`;
		fg = amber;
		bg = amberSurface;
	} else if (!m.online) {
		text = `Offline · ${m.waiting.length} waiting · data from ${m.data.lastSynced}`;
	} else if (m.waiting.length) {
		text = `Sending ${m.waiting.length}…`;
	} else if (downloading) {
		text =
			m.network === 'cellular' && !m.cellularOk
				? `History ${pct}% · waiting for Wi-Fi`
				: `Downloading history ${pct}%`;
		fg = blue;
		bg = '#e0e7ff';
	}
	if (!text) return null;
	return (
		<Pressable
			onPress={onPress}
			style={{ backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 8 }}
		>
			<Text style={{ color: fg, fontWeight: '600', fontSize: 13 }}>{text}</Text>
		</Pressable>
	);
}

export function VariantB() {
	const m = useModel();
	const nav = useNav();
	const [menu, setMenu] = useState(false);
	const toSync = () => nav.push({ k: 'sync' });
	const badges: Partial<Record<Tab, number>> = {};
	for (const x of m.attention) {
		const tab = m.data.records.find((r) => r.id === x.recordId)?.tab;
		if (tab) badges[tab] = (badges[tab] ?? 0) + 1;
	}

	const body =
		nav.top?.k === 'sync' ? (
			<View style={s.fill}>
				<TopBar title="Sync" onBack={nav.pop} />
				<ScrollView contentContainerStyle={[s.pad, { gap: 20, paddingBottom: 120 }]}>
					{m.attention.length ? (
						<Section title={`Needs you (${m.attention.length})`}>
							<AttentionList onOpen={(x) => openCmd(nav, x)} />
						</Section>
					) : null}
					<Section
						title={`Waiting to send (${m.waiting.length - m.attention.filter((a) => m.waiting.includes(a)).length})`}
					>
						<WaitingList onOpen={(x) => openCmd(nav, x)} />
					</Section>
					<Section title="This phone">
						<Freshness />
					</Section>
					<Section title="Downloads">
						<Downloads />
					</Section>
				</ScrollView>
			</View>
		) : nav.top ? (
			<Pushed nav={nav} status={<Strip onPress={toSync} />} />
		) : (
			<View style={s.fill}>
				{nav.tab === 'map' ? (
					<>
						<TopBar title={m.org} left={<Avatar onPress={() => setMenu(true)} />} />
						<Strip onPress={toSync} />
						<HomeMap onPin={(id) => nav.push({ k: 'record', id })}>
							<TrackPill floating />
							<RecordFab onPress={m.quickSave} />
						</HomeMap>
					</>
				) : (
					<>
						<TrackPill />
						<TopBar title={TITLES[nav.tab]} left={<Avatar onPress={() => setMenu(true)} />} />
						<Strip onPress={toSync} />
						<RecordList tab={nav.tab} onOpen={(r) => nav.push({ k: 'record', id: r.id })} />
					</>
				)}
				<TabBar tab={nav.tab} onTab={nav.setTab} badges={badges} />
			</View>
		);

	return (
		<Gate onReview={toSync}>
			{body}
			<ToastBar />
			{menu ? (
				<MenuSheet
					onClose={() => setMenu(false)}
					syncRow={
						<MenuItem
							label="Sync"
							sub={`${m.waiting.length} waiting`}
							onPress={() => {
								setMenu(false);
								toSync();
							}}
						/>
					}
				/>
			) : null}
		</Gate>
	);
}

// =============================================================================
// C. Map chip and alert
// =============================================================================

export const nameC = 'Map chip and alert';

function Chip({ onPress }: { readonly onPress: () => void }) {
	const m = useModel();
	const hard = m.attention.filter((x) =>
		['refused', 'held', 'stuck'].includes(attentionOf(x) ?? ''),
	);
	const downloading = m.history.done < m.history.total;
	const [glyph, label, fg, bg] = hard.length
		? ['⚠', `${hard.length}`, '#fff', c.danger]
		: m.attention.length
			? ['⚠', `${m.attention.length}`, '#fff', amber]
			: !m.online
				? ['☁̸', m.waiting.length ? `${m.waiting.length}` : 'Offline', c.text, '#fff']
				: m.waiting.length
					? ['↑', `${m.waiting.length}`, c.text, '#fff']
					: downloading
						? ['↓', `${Math.round((m.history.done / m.history.total) * 100)}%`, blue, '#fff']
						: ['✓', '', c.accent, '#fff'];
	return (
		<Pressable
			onPress={onPress}
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 4,
				backgroundColor: bg,
				borderRadius: 18,
				paddingHorizontal: 12,
				height: 36,
				borderWidth: 1,
				borderColor: c.border,
			}}
		>
			<Text style={{ color: fg, fontWeight: '800' }}>{glyph}</Text>
			{label ? <Text style={{ color: fg, fontWeight: '700' }}>{label}</Text> : null}
		</Pressable>
	);
}

type SheetTab = 'needs' | 'waiting' | 'downloads';

function SyncSheet({
	nav,
	onClose,
	start,
}: {
	readonly nav: Nav;
	readonly onClose: () => void;
	readonly start: SheetTab;
}) {
	const m = useModel();
	const [t, setT] = useState<SheetTab>(start);
	const open = (x: Cmd) => {
		onClose();
		openCmd(nav, x);
	};
	const tabs: [SheetTab, string][] = [
		['needs', `Needs you ${m.attention.length || ''}`],
		['waiting', `Waiting ${m.waiting.length || ''}`],
		['downloads', 'Downloads'],
	];
	return (
		<SheetFrame onClose={onClose}>
			<Freshness />
			<View style={[s.row, { gap: 6 }]}>
				{tabs.map(([k, label]) => (
					<Pressable
						key={k}
						onPress={() => setT(k)}
						style={[s.chip, { minHeight: 36, flex: 1, alignItems: 'center' }, t === k && s.chipOn]}
					>
						<Text style={[s.chipText, { fontSize: 13 }, t === k && s.onAccent]}>{label}</Text>
					</Pressable>
				))}
			</View>
			<ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
				{t === 'needs' ? (
					<AttentionList onOpen={open} />
				) : t === 'waiting' ? (
					<WaitingList onOpen={open} />
				) : (
					<Downloads />
				)}
			</ScrollView>
		</SheetFrame>
	);
}

function RefusalAlert({
	onReview,
	onLater,
}: {
	readonly onReview: () => void;
	readonly onLater: () => void;
}) {
	const m = useModel();
	const r = m.data.cmds.find((x) => x.status === 'refused');
	if (!r) return null;
	return (
		<View
			style={{
				position: 'absolute',
				top: 40,
				left: 12,
				right: 12,
				backgroundColor: '#fff',
				borderRadius: 14,
				borderLeftWidth: 6,
				borderLeftColor: c.danger,
				padding: 14,
				gap: 8,
				zIndex: 35,
				elevation: 8,
				shadowColor: '#000',
				shadowOpacity: 0.2,
				shadowRadius: 10,
			}}
		>
			<Text style={s.strong}>{r.summary} was not accepted</Text>
			<Text style={s.muted}>{r.reason}</Text>
			<View style={[s.row, { justifyContent: 'flex-end' }]}>
				<B label="Later" tone="ghost" onPress={onLater} />
				<B label="Review" tone="primary" onPress={onReview} />
			</View>
		</View>
	);
}

export function VariantC() {
	const m = useModel();
	const nav = useNav();
	const [menu, setMenu] = useState(false);
	const [sheet, setSheet] = useState<SheetTab | null>(null);
	const [alert, setAlert] = useState(false);
	const [notSentOnly, setNotSentOnly] = useState(false);
	const seen = useRef(m.refusalTick);
	useEffect(() => {
		if (m.refusalTick !== seen.current) {
			seen.current = m.refusalTick;
			setAlert(true);
		}
	}, [m.refusalTick]);
	const openSheet = () =>
		setSheet(m.attention.length ? 'needs' : m.waiting.length ? 'waiting' : 'downloads');
	const badges: Partial<Record<Tab, number>> = {};
	for (const x of m.attention) {
		const tab = m.data.records.find((r) => r.id === x.recordId)?.tab;
		if (tab) badges[tab] = (badges[tab] ?? 0) + 1;
	}

	const listTab = nav.tab === 'map' ? null : nav.tab;
	const notSentHere = listTab
		? m.data.records.filter((r) => r.tab === listTab && m.cmdFor(r.id)).length
		: 0;

	const body = nav.top ? (
		<Pushed nav={nav} right={<Chip onPress={openSheet} />} />
	) : (
		<View style={s.fill}>
			{listTab === null ? (
				<HomeMap onPin={(id) => nav.push({ k: 'record', id })}>
					<View style={{ position: 'absolute', top: 48, left: 12 }}>
						<Avatar onPress={() => setMenu(true)} />
					</View>
					<View style={{ position: 'absolute', top: 48, right: 12 }}>
						<Chip onPress={openSheet} />
					</View>
					<TrackPill floating />
					<RecordFab onPress={m.quickSave} />
				</HomeMap>
			) : (
				<>
					<TrackPill />
					<TopBar
						title={TITLES[listTab]}
						left={<Avatar onPress={() => setMenu(true)} />}
						right={<Chip onPress={openSheet} />}
					/>
					{notSentHere ? (
						<View style={[s.row, { paddingHorizontal: 12, paddingTop: 10 }]}>
							{[
								[false, 'All'],
								[true, `Not sent (${notSentHere})`],
							].map(([v, label]) => (
								<Pressable
									key={String(label)}
									onPress={() => setNotSentOnly(v as boolean)}
									style={[s.chip, { minHeight: 34 }, notSentOnly === v && s.chipOn]}
								>
									<Text style={[s.chipText, { fontSize: 13 }, notSentOnly === v && s.onAccent]}>
										{label as string}
									</Text>
								</Pressable>
							))}
						</View>
					) : null}
					<RecordList
						tab={listTab}
						onOpen={(r) => nav.push({ k: 'record', id: r.id })}
						only={notSentOnly ? (r) => m.cmdFor(r.id) !== undefined : undefined}
					/>
				</>
			)}
			<TabBar tab={nav.tab} onTab={nav.setTab} badges={badges} />
		</View>
	);

	return (
		<Gate onReview={() => setSheet('needs')}>
			{body}
			<ToastBar />
			{alert ? (
				<RefusalAlert
					onLater={() => setAlert(false)}
					onReview={() => {
						setAlert(false);
						const r = m.data.cmds.find((x) => x.status === 'refused');
						if (r) nav.push({ k: 'refused', id: r.id });
					}}
				/>
			) : null}
			{sheet ? <SyncSheet nav={nav} start={sheet} onClose={() => setSheet(null)} /> : null}
			{menu ? (
				<MenuSheet
					onClose={() => setMenu(false)}
					syncRow={
						<MenuItem
							label="Sync status"
							onPress={() => {
								setMenu(false);
								openSheet();
							}}
						/>
					}
				/>
			) : null}
		</Gate>
	);
}
