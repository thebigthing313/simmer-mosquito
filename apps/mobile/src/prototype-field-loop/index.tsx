/**
 * PROTOTYPE, throwaway. The field loop prototype for #1338: three variants of
 * worklist, stop, record, next stop, over fake data, switched from a bar at the
 * bottom. Mounted by `_layout.tsx` in place of the whole app when
 * `EXPO_PUBLIC_PROTOTYPE=field-loop`, so no server or sign-in is needed.
 *
 * The pill at the top right is the state: taps on the open stop, taps per
 * stop left, and every command the loop would have queued, by its real name.
 */
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrototypeStore, useStore } from './store';
import { c, s } from './ui';
import { nameA, VariantA } from './variant-a';
import { nameB, VariantB } from './variant-b';
import { nameC, VariantC } from './variant-c';

const VARIANTS = [
	{ key: 'A', name: nameA, View: VariantA },
	{ key: 'B', name: nameB, View: VariantB },
	{ key: 'C', name: nameC, View: VariantC },
] as const;

function initialVariant(): number {
	if (Platform.OS !== 'web') return 0;
	const key = new URLSearchParams(window.location.search).get('variant');
	return Math.max(
		0,
		VARIANTS.findIndex((v) => v.key === key),
	);
}

export function FieldLoopPrototype() {
	return (
		<PrototypeStore>
			{/* On web, hold the phone's width so a desktop browser shows the phone layout. */}
			<View style={{ flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', overflow: 'hidden' }}>
				<Switcher />
			</View>
		</PrototypeStore>
	);
}

function Switcher() {
	const [index, setIndex] = useState(initialVariant);
	const insets = useSafeAreaInsets();
	const variant = VARIANTS[index] ?? VARIANTS[0];
	const move = (by: number) => {
		const next = (index + by + VARIANTS.length) % VARIANTS.length;
		setIndex(next);
		if (Platform.OS === 'web') {
			const url = new URL(window.location.href);
			url.searchParams.set('variant', VARIANTS[next]?.key ?? 'A');
			window.history.replaceState(null, '', url);
		}
	};
	return (
		<View style={s.fill}>
			<variant.View key={variant.key} />
			<View
				style={{
					position: 'absolute',
					bottom: insets.bottom + 8,
					alignSelf: 'center',
					flexDirection: 'row',
					alignItems: 'center',
					backgroundColor: '#5b21b6',
					borderRadius: 24,
					zIndex: 50,
				}}
			>
				<Pressable onPress={() => move(-1)} style={{ padding: 12 }}>
					<Text style={{ color: '#fff', fontSize: 18 }}>◀</Text>
				</Pressable>
				<Text style={{ color: '#fff', fontWeight: '700' }}>
					{variant.key} · {variant.name}
				</Text>
				<Pressable onPress={() => move(1)} style={{ padding: 12 }}>
					<Text style={{ color: '#fff', fontSize: 18 }}>▶</Text>
				</Pressable>
			</View>
			<DebugPanel />
		</View>
	);
}

function DebugPanel() {
	const { taps, tapLog, log, reset } = useStore();
	const [open, setOpen] = useState(false);
	const insets = useSafeAreaInsets();
	return (
		<>
			<Pressable
				onPress={() => setOpen((o) => !o)}
				style={{
					position: 'absolute',
					top: insets.top + 54,
					right: 8,
					backgroundColor: '#5b21b6',
					borderRadius: 14,
					paddingHorizontal: 10,
					paddingVertical: 5,
					zIndex: 60,
				}}
			>
				<Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
					{taps} taps · {log.filter((e) => !e.discarded).length} cmds
				</Text>
			</Pressable>
			{open ? (
				<View
					style={{
						position: 'absolute',
						top: insets.top + 84,
						left: 8,
						right: 8,
						maxHeight: '70%',
						backgroundColor: '#1f1235',
						borderRadius: 12,
						padding: 12,
						zIndex: 60,
					}}
				>
					<ScrollView contentContainerStyle={{ gap: 4 }}>
						<Text style={{ color: '#c4b5fd', fontWeight: '700' }}>
							Taps per stop (from the stop opening to its outcome)
						</Text>
						{tapLog.length === 0 ? <Text style={{ color: '#ddd' }}>none yet</Text> : null}
						{tapLog.map((t, i) => (
							<Text key={`${t.stop}-${i}`} style={{ color: '#fff' }}>
								{t.taps} · {t.stop} · {t.outcome}
							</Text>
						))}
						<Text style={{ color: '#c4b5fd', fontWeight: '700', marginTop: 8 }}>
							Command queue, in send order
						</Text>
						{log.length === 0 ? <Text style={{ color: '#ddd' }}>empty</Text> : null}
						{log.map((e) => (
							<Text
								key={e.id}
								style={{
									color: e.discarded ? '#888' : '#fff',
									fontSize: 12,
									textDecorationLine: e.discarded ? 'line-through' : 'none',
								}}
							>
								{e.text}
							</Text>
						))}
					</ScrollView>
					<View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
						<Pressable
							onPress={reset}
							style={{ padding: 8, backgroundColor: c.danger, borderRadius: 8 }}
						>
							<Text style={{ color: '#fff', fontWeight: '700' }}>Reset all</Text>
						</Pressable>
						<Pressable onPress={() => setOpen(false)} style={{ padding: 8 }}>
							<Text style={{ color: '#fff' }}>Close</Text>
						</Pressable>
					</View>
				</View>
			) : null}
		</>
	);
}
