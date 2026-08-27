import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/auth-context';
import { theme } from '../theme/theme';

/**
 * The app shell and its one gate.
 *
 * Routing is driven by `Stack.Protected` rather than a redirect from inside a
 * screen: a redirect renders the wrong screen first and only then navigates
 * away, which on a cold start with a valid stored session means a visible flash
 * of the sign-in form. The `loading` state below exists to hold that moment
 * open until SecureStore and `/auth/me` have answered.
 */
export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<StatusBar style="dark" />
			<AuthProvider>
				<RootNavigator />
			</AuthProvider>
		</SafeAreaProvider>
	);
}

function RootNavigator() {
	const { state } = useAuth();

	if (state.status === 'loading') {
		return (
			<View style={styles.splash}>
				<ActivityIndicator color={theme.color.accent} size="large" />
			</View>
		);
	}

	const signedIn = state.status === 'signed-in';

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Protected guard={signedIn}>
				<Stack.Screen name="index" />
			</Stack.Protected>
			<Stack.Protected guard={!signedIn}>
				<Stack.Screen name="sign-in" />
			</Stack.Protected>
		</Stack>
	);
}

const styles = StyleSheet.create({
	splash: {
		alignItems: 'center',
		backgroundColor: theme.color.background,
		flex: 1,
		justifyContent: 'center',
	},
});
