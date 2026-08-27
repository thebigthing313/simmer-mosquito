import type { SignInOutcome } from '@simmer-mosquito/auth/browser';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/button';
import { Screen } from '../components/screen';
import { TextField } from '../components/text-field';
import { theme } from '../theme/theme';

export default function SignInScreen() {
	const { signIn } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [problem, setProblem] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit() {
		setBusy(true);
		setProblem(null);

		try {
			const outcome = await signIn({ email: email.trim(), password });
			// On success the session changes and the root layout swaps the stack;
			// there is nothing for this screen to navigate to itself.
			if (outcome.status !== 'authenticated') {
				setProblem(describe(outcome));
			}
		} catch {
			setProblem('Could not reach SIMMER. Check your connection and try again.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<Screen>
			<View style={styles.header}>
				<Text style={styles.title}>SIMMER</Text>
				<Text style={styles.subtitle}>Sign in to your agency.</Text>
			</View>

			<View style={styles.form}>
				<TextField
					label="Email"
					autoCapitalize="none"
					autoComplete="email"
					autoCorrect={false}
					inputMode="email"
					onChangeText={setEmail}
					value={email}
				/>
				<TextField
					label="Password"
					autoCapitalize="none"
					autoComplete="current-password"
					onChangeText={setPassword}
					onSubmitEditing={() => void submit()}
					returnKeyType="go"
					secureTextEntry
					value={password}
				/>

				{problem === null ? null : (
					<Text accessibilityLiveRegion="polite" style={styles.problem}>
						{problem}
					</Text>
				)}

				<Button
					busy={busy}
					disabled={email.trim() === '' || password === ''}
					label="Sign in"
					onPress={() => void submit()}
				/>
			</View>
		</Screen>
	);
}

/**
 * What to put in front of the user for each outcome the server can return.
 *
 * Two of these are real flows this app does not have screens for yet. They are
 * named rather than folded into a generic failure because "wrong password" and
 * "your account needs a step this app cannot show you" send the user to
 * completely different places, and a single "Unable to sign in" would strand
 * the second one with no idea what to do next.
 */
function describe(outcome: Exclude<SignInOutcome, { status: 'authenticated' }>): string {
	switch (outcome.status) {
		case 'invalid_credentials':
			return 'That email and password do not match.';
		case 'verification_required':
			return 'Your email needs verifying. Finish signing in on the SIMMER web app, then come back.';
		case 'organization_selection_required':
			return 'Your account covers more than one agency. Choose one on the SIMMER web app, then come back.';
		default:
			return outcome.reason;
	}
}

const styles = StyleSheet.create({
	header: {
		gap: theme.space.xs,
		paddingTop: theme.space.xl,
	},
	title: {
		color: theme.color.text,
		fontSize: theme.fontSize.title,
		fontWeight: '700',
		letterSpacing: 0.5,
	},
	subtitle: {
		color: theme.color.textMuted,
		fontSize: theme.fontSize.base,
	},
	form: {
		gap: theme.space.md,
	},
	problem: {
		color: theme.color.danger,
		fontSize: theme.fontSize.sm,
	},
});
