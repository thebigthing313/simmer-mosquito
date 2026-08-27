import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '../theme/theme';

/**
 * The primary action.
 *
 * `busy` disables as well as spins, because the actions this app takes are
 * writes and a double-tap on a slow network is a duplicate record, not a
 * duplicate render. The 48pt minimum is a gloved-thumb target, not a style
 * choice.
 */
export function Button({
	label,
	onPress,
	busy = false,
	disabled = false,
}: {
	readonly label: string;
	readonly onPress: () => void;
	readonly busy?: boolean;
	readonly disabled?: boolean;
}) {
	const inert = busy || disabled;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ busy, disabled: inert }}
			disabled={inert}
			onPress={onPress}
			style={({ pressed }) => [styles.button, pressed && styles.pressed, inert && styles.inert]}
		>
			{busy ? (
				<ActivityIndicator color={theme.color.accentText} />
			) : (
				<Text style={styles.label}>{label}</Text>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		alignItems: 'center',
		backgroundColor: theme.color.accent,
		borderRadius: theme.radius.md,
		justifyContent: 'center',
		minHeight: 48,
		paddingHorizontal: theme.space.md,
	},
	pressed: {
		backgroundColor: theme.color.accentPressed,
	},
	inert: {
		opacity: 0.6,
	},
	label: {
		color: theme.color.accentText,
		fontSize: theme.fontSize.base,
		fontWeight: '600',
	},
});
