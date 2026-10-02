/**
 * PROTOTYPE, throwaway. Small widgets the three variants draw with.
 *
 * Every pressable here goes through `Tap`, which counts the press, so the tap
 * counter measures the design rather than the reviewer's wandering. The
 * switcher bar and the debug panel use a bare Pressable and are not counted.
 */
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';
import { useStore } from './store';

export const c = theme.color;

export function Tap({
	onPress,
	children,
	style,
	disabled,
}: {
	readonly onPress: () => void;
	readonly children: ReactNode;
	readonly style?: StyleProp<ViewStyle> | undefined;
	readonly disabled?: boolean | undefined;
}) {
	const { tap } = useStore();
	return (
		<Pressable
			disabled={disabled}
			onPress={() => {
				tap();
				onPress();
			}}
			style={({ pressed }) => [style, pressed && { opacity: 0.6 }, disabled && { opacity: 0.4 }]}
		>
			{children}
		</Pressable>
	);
}

type Tone = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Btn({
	label,
	onPress,
	tone = 'secondary',
	big,
	disabled,
	style,
	sub,
}: {
	readonly label: string;
	readonly onPress: () => void;
	readonly tone?: Tone;
	readonly big?: boolean;
	readonly disabled?: boolean | undefined;
	readonly style?: StyleProp<ViewStyle> | undefined;
	readonly sub?: string | undefined;
}) {
	return (
		<Tap disabled={disabled} onPress={onPress} style={[s.btn, s[tone], big && s.big, style]}>
			<Text
				style={[
					s.btnLabel,
					tone === 'primary' || tone === 'danger' ? s.onAccent : null,
					big && s.bigLabel,
				]}
			>
				{label}
			</Text>
			{sub ? (
				<Text style={[s.btnSub, tone === 'primary' ? s.onAccent : null]} numberOfLines={1}>
					{sub}
				</Text>
			) : null}
		</Tap>
	);
}

export function Chips<T extends string>({
	options,
	value,
	onChange,
}: {
	readonly options: readonly T[];
	readonly value: T | undefined;
	readonly onChange: (v: T) => void;
}) {
	return (
		<View style={s.chips}>
			{options.map((o) => (
				<Tap key={o} onPress={() => onChange(o)} style={[s.chip, value === o && s.chipOn]}>
					<Text style={[s.chipText, value === o && s.onAccent]}>{o}</Text>
				</Tap>
			))}
		</View>
	);
}

export function MultiChips({
	options,
	value,
	onChange,
}: {
	readonly options: readonly string[];
	readonly value: readonly string[];
	readonly onChange: (v: string[]) => void;
}) {
	return (
		<View style={s.chips}>
			{options.map((o) => {
				const on = value.includes(o);
				return (
					<Tap
						key={o}
						onPress={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
						style={[s.chip, on && s.chipOn]}
					>
						<Text style={[s.chipText, on && s.onAccent]}>{o}</Text>
					</Tap>
				);
			})}
		</View>
	);
}

export function Stepper({
	value,
	onChange,
	step = 1,
}: {
	readonly value: number;
	readonly onChange: (v: number) => void;
	readonly step?: number;
}) {
	return (
		<View style={s.stepper}>
			<Tap onPress={() => onChange(Math.max(0, value - step))} style={s.stepBtn}>
				<Text style={s.stepGlyph}>−</Text>
			</Tap>
			<Text style={s.stepValue}>{value}</Text>
			<Tap onPress={() => onChange(value + step)} style={s.stepBtn}>
				<Text style={s.stepGlyph}>+</Text>
			</Tap>
		</View>
	);
}

export function Toggle({
	label,
	value,
	onChange,
}: {
	readonly label: string;
	readonly value: boolean;
	readonly onChange: (v: boolean) => void;
}) {
	return (
		<Tap onPress={() => onChange(!value)} style={s.toggle}>
			<Text style={s.body}>{label}</Text>
			<View style={[s.box, value && s.boxOn]}>
				{value ? <Text style={[s.onAccent, { fontWeight: '700' }]}>✓</Text> : null}
			</View>
		</Tap>
	);
}

export function Field({
	label,
	children,
}: {
	readonly label: string;
	readonly children: ReactNode;
}) {
	return (
		<View style={{ gap: 6 }}>
			<Text style={s.label}>{label}</Text>
			{children}
		</View>
	);
}

export function Header({
	title,
	sub,
	onBack,
	right,
}: {
	readonly title: string;
	readonly sub?: string | undefined;
	readonly onBack?: () => void;
	readonly right?: ReactNode;
}) {
	const insets = useSafeAreaInsets();
	return (
		<View style={[s.header, { paddingTop: insets.top + 8 }]}>
			{onBack ? (
				<Tap onPress={onBack} style={s.back}>
					<Text style={s.backGlyph}>‹</Text>
				</Tap>
			) : null}
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

export function Sheet({
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
			<View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>{children}</View>
		</View>
	);
}

export function Toast({ text, action }: { readonly text: string; readonly action?: ReactNode }) {
	return (
		<View style={s.toast}>
			<Text style={[s.onAccent, { flex: 1 }]}>{text}</Text>
			{action}
		</View>
	);
}

export function StatusDot({ status }: { readonly status: 'pending' | 'done' | 'skipped' }) {
	return (
		<View
			style={[
				s.dot,
				status === 'done' && { backgroundColor: c.accent, borderColor: c.accent },
				status === 'skipped' && { backgroundColor: c.textFaint, borderColor: c.textFaint },
			]}
		/>
	);
}

export const s = StyleSheet.create({
	fill: { flex: 1, backgroundColor: c.background },
	pad: { padding: 16, gap: 12 },
	body: { color: c.text, fontSize: 15 },
	strong: { color: c.text, fontSize: 15, fontWeight: '600' },
	muted: { color: c.textMuted, fontSize: 13 },
	label: {
		color: c.textMuted,
		fontSize: 12,
		fontWeight: '700',
		textTransform: 'uppercase',
		letterSpacing: 0.4,
	},
	title: { color: c.text, fontSize: 18, fontWeight: '700' },
	onAccent: { color: '#ffffff' },
	card: {
		backgroundColor: c.surface,
		borderColor: c.border,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 12,
		padding: 14,
		gap: 6,
	},
	row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	btn: {
		minHeight: 48,
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 10,
		alignItems: 'center',
		justifyContent: 'center',
	},
	big: { minHeight: 64 },
	primary: { backgroundColor: c.accent },
	secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
	ghost: { backgroundColor: 'transparent' },
	danger: { backgroundColor: c.danger },
	btnLabel: { color: c.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
	bigLabel: { fontSize: 17 },
	btnSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
	chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	chip: {
		minHeight: 44,
		paddingHorizontal: 14,
		borderRadius: 22,
		borderWidth: 1,
		borderColor: c.border,
		backgroundColor: c.surface,
		justifyContent: 'center',
	},
	chipOn: { backgroundColor: c.accent, borderColor: c.accent },
	chipText: { color: c.text, fontSize: 15 },
	stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
	stepBtn: {
		width: 48,
		height: 48,
		borderRadius: 24,
		borderWidth: 1,
		borderColor: c.border,
		backgroundColor: c.surface,
		alignItems: 'center',
		justifyContent: 'center',
	},
	stepGlyph: { fontSize: 22, color: c.text },
	stepValue: { fontSize: 20, fontWeight: '700', minWidth: 36, textAlign: 'center', color: c.text },
	toggle: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		minHeight: 48,
	},
	box: {
		width: 28,
		height: 28,
		borderRadius: 6,
		borderWidth: 1.5,
		borderColor: c.border,
		alignItems: 'center',
		justifyContent: 'center',
	},
	boxOn: { backgroundColor: c.accent, borderColor: c.accent },
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 12,
		paddingBottom: 10,
		backgroundColor: c.surface,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: c.border,
	},
	back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
	backGlyph: { fontSize: 30, color: c.accent, marginTop: -4 },
	scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 20 },
	sheet: {
		backgroundColor: c.surface,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		padding: 16,
		gap: 12,
		maxHeight: '85%',
	},
	toast: {
		position: 'absolute',
		left: 12,
		right: 12,
		bottom: 120,
		backgroundColor: c.text,
		borderRadius: 10,
		padding: 14,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		zIndex: 30,
	},
	dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.border },
	bar: {
		flexDirection: 'row',
		gap: 8,
		padding: 12,
		backgroundColor: c.surface,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: c.border,
	},
});
