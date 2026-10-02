/**
 * PROTOTYPE, throwaway. The sync status prototype for #1348: three variants
 * of where the queue's state and the needs-attention list live, over fake
 * data, switched from the bar at the bottom. Mounted by `_layout.tsx` in place
 * of the whole app when `EXPO_PUBLIC_PROTOTYPE=sync-status`.
 *
 * The "Scenario" pill at the top right plays the network and the server:
 * go online, have the server refuse the next send, make a send stick, age a
 * command past 60 days, start a Track, kill the session, drop the role.
 */
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrototypeStore } from '../prototype-field-loop/store';
import { s } from '../prototype-field-loop/ui';
import { ModelProvider, useModel } from './model';
import { nameA, nameB, nameC, VariantA, VariantB, VariantC } from './variants';

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

export function SyncStatusPrototype() {
	return (
		<PrototypeStore>
			<ModelProvider>
				<View
					style={{ flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center', overflow: 'hidden' }}
				>
					<Switcher />
				</View>
			</ModelProvider>
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
			<Scenario />
		</View>
	);
}

function Scenario() {
	const m = useModel();
	const [open, setOpen] = useState(false);
	const insets = useSafeAreaInsets();
	const btn = (label: string, onPress: () => void, on?: boolean) => (
		<Pressable
			key={label}
			onPress={onPress}
			style={{
				paddingHorizontal: 10,
				paddingVertical: 7,
				borderRadius: 8,
				backgroundColor: on ? '#a78bfa' : '#3b2a5c',
			}}
		>
			<Text style={{ color: '#fff', fontSize: 12 }}>{label}</Text>
		</Pressable>
	);
	return (
		<>
			<Pressable
				onPress={() => setOpen((o) => !o)}
				style={{
					position: 'absolute',
					top: insets.top + 4,
					right: 8,
					backgroundColor: '#5b21b6',
					borderRadius: 14,
					paddingHorizontal: 10,
					paddingVertical: 5,
					zIndex: 60,
				}}
			>
				<Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
					Scenario · {m.network} · {m.data.cmds.length} queued
				</Text>
			</Pressable>
			{open ? (
				<View
					style={{
						position: 'absolute',
						top: insets.top + 34,
						left: 8,
						right: 8,
						maxHeight: '75%',
						backgroundColor: '#1f1235',
						borderRadius: 12,
						padding: 12,
						zIndex: 60,
					}}
				>
					<ScrollView contentContainerStyle={{ gap: 10 }}>
						<Text style={{ color: '#c4b5fd', fontWeight: '700' }}>Network</Text>
						<View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
							{btn('Offline', () => m.setNetwork('offline'), m.network === 'offline')}
							{btn('Wi-Fi', () => m.setNetwork('wifi'), m.network === 'wifi')}
							{btn('Cellular', () => m.setNetwork('cellular'), m.network === 'cellular')}
						</View>
						<Text style={{ color: '#c4b5fd', fontWeight: '700' }}>Server</Text>
						<View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
							{btn('Refuse the HAB-0142 inspection on its next send (409)', m.markRefuse)}
							{btn('TRP-021 collect gets 10 × 503 (stuck)', m.markStuck)}
							{btn('Session dies', m.killSession)}
							{btn('Role drops to Viewer', m.dropRole)}
							{btn('Role restored', m.restoreRole)}
						</View>
						<Text style={{ color: '#c4b5fd', fontWeight: '700' }}>Phone</Text>
						<View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
							{btn('Oldest command is 61 days old', m.ageOne)}
							{btn('Start a Track', m.trackStart)}
							{btn('One-tap save (with Undo)', m.quickSave)}
							{btn('Reset all', m.reset)}
						</View>
						<Text style={{ color: '#c4b5fd', fontWeight: '700' }}>
							Queue, in send order ({m.org})
						</Text>
						{m.data.cmds.length === 0 ? <Text style={{ color: '#ddd' }}>empty</Text> : null}
						{m.data.cmds.map((x) => (
							<Text key={x.id} style={{ color: '#fff', fontSize: 11 }}>
								{x.status.padEnd(8)} {x.command}
								{x.willRefuse ? '  (will refuse)' : ''}
							</Text>
						))}
					</ScrollView>
					<Pressable onPress={() => setOpen(false)} style={{ padding: 8, alignSelf: 'flex-end' }}>
						<Text style={{ color: '#fff' }}>Close</Text>
					</Pressable>
				</View>
			) : null}
		</>
	);
}
