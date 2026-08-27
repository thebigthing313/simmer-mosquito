import type { AuthMe, SignInOutcome } from '@simmer-mosquito/auth/browser';
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import { appAuthController, authClient } from './client';

/**
 * The session, as the screens see it.
 *
 * Three states rather than two. "We have not asked yet" and "we asked and the
 * answer was no" look identical in a nullable session and are completely
 * different to render: the first is a splash, the second is the sign-in screen.
 * Collapsing them is how an app comes to flash its login form at an already
 * signed-in user on every cold start.
 */
type AuthState =
	| { readonly status: 'loading' }
	| { readonly status: 'signed-out'; readonly reason: string }
	| { readonly status: 'signed-in'; readonly me: Extract<AuthMe, { authenticated: true }> };

interface AuthContextValue {
	readonly state: AuthState;
	readonly signIn: (input: {
		readonly email: string;
		readonly password: string;
	}) => Promise<SignInOutcome>;
	readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toState(me: AuthMe | null): AuthState {
	if (me === null) {
		return { status: 'loading' };
	}

	return me.authenticated
		? { status: 'signed-in', me }
		: { status: 'signed-out', reason: me.reason };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
	const [me, setMe] = useState<AuthMe | null>(appAuthController.snapshot);

	useEffect(() => {
		const unsubscribe = appAuthController.subscribe(() => {
			setMe(appAuthController.snapshot);
		});

		void appAuthController.load();

		return unsubscribe;
	}, []);

	const signIn = useCallback(
		async (input: { readonly email: string; readonly password: string }) => {
			const outcome = await authClient.signIn(input);

			/*
			 * Only an outright success moves the session on. The other outcomes —
			 * a verification code, an organization to pick — are live conversations
			 * the caller is still in the middle of, and refreshing on them would
			 * replace the screen holding that state.
			 */
			if (outcome.status === 'authenticated') {
				await appAuthController.refresh();
			}

			return outcome;
		},
		[],
	);

	const signOut = useCallback(async () => {
		await authClient.signOut();
		await appAuthController.refresh();
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({ state: toState(me), signIn, signOut }),
		[me, signIn, signOut],
	);

	return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
	const value = useContext(AuthContext);
	if (value === null) {
		throw new Error('useAuth must be used inside <AuthProvider>.');
	}

	return value;
}
