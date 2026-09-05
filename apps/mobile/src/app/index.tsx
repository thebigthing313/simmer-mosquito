import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/auth-context';
import { Button } from '../components/button';
import { Screen } from '../components/screen';
import { theme } from '../theme/theme';

/**
 * The authenticated screen, and for now the whole of it.
 *
 * What it renders is `/auth/me` — the same resolved `AuthContext` the web app
 * gets, read over a SecureStore-held session rather than a cookie. That is the
 * scaffold's entire claim: the field app can hold a real SIMMER session and be
 * recognised by the server as a member of an agency with a role. Everything
 * under `docs/sync.md`'s mobile matrix builds on top of this and none of it is
 * here yet.
 */
export default function HomeScreen() {
	const { state, signOut } = useAuth();

	if (state.status !== 'signed-in') {
		return null;
	}

	const { user, localIdentity } = state.me;

	return (
		<Screen>
			<View style={styles.header}>
				<Text style={styles.greeting}>{user.displayName}</Text>
				<Text style={styles.email}>{user.email}</Text>
			</View>

			<View style={styles.card}>
				<Row label="Organization" value={localIdentity.organizationName} empty="None selected" />
				<Row label="Role" value={localIdentity.role} empty="None" />
				<Row label="Profile" value={localIdentity.profileId} empty="None" />
			</View>

			<View style={styles.footer}>
				<Button label="Sign out" onPress={() => void signOut()} />
			</View>
		</Screen>
	);
}

/**
 * One labelled fact, including the case where there isn't one.
 *
 * The row owns its own empty state rather than taking a pre-resolved string, so
 * a missing agency or role reads as absent — greyed — instead of looking like a
 * value somebody entered.
 */
function Row({
	label,
	value,
	empty,
}: {
	readonly label: string;
	readonly value: string | null | undefined;
	readonly empty: string;
}) {
	const shown = value ?? empty;

	return (
		<View style={styles.row}>
			<Text style={styles.rowLabel}>{label}</Text>
			<Text numberOfLines={1} style={shown === empty ? styles.rowValueEmpty : styles.rowValue}>
				{shown}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	header: {
		gap: theme.space.xs,
		paddingTop: theme.space.md,
	},
	greeting: {
		color: theme.color.text,
		fontSize: theme.fontSize.title,
		fontWeight: '700',
	},
	email: {
		color: theme.color.textMuted,
		fontSize: theme.fontSize.base,
	},
	card: {
		backgroundColor: theme.color.surface,
		borderColor: theme.color.border,
		borderRadius: theme.radius.lg,
		borderWidth: StyleSheet.hairlineWidth,
		gap: theme.space.md,
		padding: theme.space.md,
	},
	row: {
		alignItems: 'center',
		flexDirection: 'row',
		gap: theme.space.md,
		justifyContent: 'space-between',
	},
	rowLabel: {
		color: theme.color.textMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: '600',
	},
	rowValue: {
		color: theme.color.text,
		flexShrink: 1,
		fontSize: theme.fontSize.base,
	},
	rowValueEmpty: {
		color: theme.color.textFaint,
		flexShrink: 1,
		fontSize: theme.fontSize.base,
	},
	footer: {
		marginTop: 'auto',
	},
});
