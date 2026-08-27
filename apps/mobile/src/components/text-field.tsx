import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { theme } from '../theme/theme';

/**
 * A labelled text input.
 *
 * The label is a real `<Text>` above the field rather than a placeholder: a
 * placeholder disappears the moment there is a value, which is exactly when
 * someone checking their work needs to know what they are looking at.
 */
export function TextField({ label, ...input }: TextInputProps & { readonly label: string }) {
	return (
		<View style={styles.field}>
			<Text style={styles.label}>{label}</Text>
			<TextInput
				accessibilityLabel={label}
				placeholderTextColor={theme.color.textFaint}
				style={styles.input}
				{...input}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	field: {
		gap: theme.space.xs,
	},
	label: {
		color: theme.color.textMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: '600',
	},
	input: {
		backgroundColor: theme.color.surface,
		borderColor: theme.color.border,
		borderRadius: theme.radius.md,
		borderWidth: StyleSheet.hairlineWidth,
		color: theme.color.text,
		fontSize: theme.fontSize.base,
		minHeight: 48,
		paddingHorizontal: theme.space.md,
	},
});
