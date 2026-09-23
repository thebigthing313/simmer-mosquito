import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
/** The session as the screens see it. Throws outside `AuthProvider`. */
export function useAuth(): AuthContextValue {
	const value = useContext(AuthContext);
	if (value === null) {
		throw new Error('useAuth must be used inside <AuthProvider>.');
	}

	return value;
}
