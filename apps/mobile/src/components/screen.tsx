import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme/theme';

/**
 * The page frame every screen sits in.
 *
 * Field staff use this app one-handed, outdoors, on a phone. That makes two
 * things non-optional from the first screen rather than retrofitted later: the
 * keyboard must not cover the input being typed into, and content must clear
 * the notch and the home indicator. Both are easier to get right once here than
 * to notice missing on any individual screen.
 */
export function Screen({ children }: { readonly children: ReactNode }) {
	const insets = useSafeAreaInsets();

	return (
		<KeyboardAvoidingView
			style={styles.root}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
		>
			<ScrollView
				contentContainerStyle={[
					styles.content,
					{
						paddingTop: insets.top + theme.space.lg,
						paddingBottom: insets.bottom + theme.space.lg,
					},
				]}
				keyboardShouldPersistTaps="handled"
			>
				<View style={styles.inner}>{children}</View>
			</ScrollView>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	root: {
		backgroundColor: theme.color.background,
		flex: 1,
	},
	content: {
		flexGrow: 1,
		paddingHorizontal: theme.space.lg,
	},
	inner: {
		flex: 1,
		gap: theme.space.lg,
	},
});
