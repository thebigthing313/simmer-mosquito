import type {
	AppAuthController,
	AuthClient,
	AuthMe,
	SignInOutcome,
} from '@simmer-mosquito/auth/browser';
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

export function toState(me: AuthMe | null): AuthState {
	if (me === null) {
		return { status: 'loading' };
	}

	return me.authenticated
		? { status: 'signed-in', me }
		: { status: 'signed-out', reason: me.reason };
}

/**
 * The client and the controller, as parameters rather than imports.
 *
 * Both default to the singletons in `./client`, and every mount in the app
 * takes the default: there is one production binding and it is already the
 * right one, so requiring callers to pass it would move construction into
 * `_layout.tsx` and buy nothing. The parameters exist so a test can reach the
 * three states, the sign-in gate and the sign-out path without mocking a module
 * path, which pins a suite to module layout instead of to behaviour.
 * `session-store.ts` next door makes the same argument for the same reason.
 *
 * Narrowed to the members this file calls, so a stub is a handful of functions
 * rather than a whole client.
 */
interface AuthProviderProps {
	readonly children: ReactNode;
	readonly client?: Pick<AuthClient, 'signIn' | 'signOut'>;
	readonly controller?: Pick<AppAuthController, 'snapshot' | 'subscribe' | 'load' | 'refresh'>;
}

export function AuthProvider({
	children,
	client = authClient,
	controller = appAuthController,
}: AuthProviderProps) {
	const [me, setMe] = useState<AuthMe | null>(controller.snapshot);

	useEffect(() => {
		const unsubscribe = controller.subscribe(() => {
			setMe(controller.snapshot);
		});

		void controller.load();

		return unsubscribe;
	}, [controller]);

	const signIn = useCallback(
		async (input: { readonly email: string; readonly password: string }) => {
			const outcome = await client.signIn(input);

			/*
			 * Only an outright success moves the session on. The other outcomes —
			 * a verification code, an organization to pick — are live conversations
			 * the caller is still in the middle of, and refreshing on them would
			 * replace the screen holding that state.
			 */
			if (outcome.status === 'authenticated') {
				await controller.refresh();
			}

			return outcome;
		},
		[client, controller],
	);

	const signOut = useCallback(async () => {
		await client.signOut();
		await controller.refresh();
	}, [client, controller]);

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
