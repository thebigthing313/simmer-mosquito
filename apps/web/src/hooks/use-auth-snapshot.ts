import { useSyncExternalStore } from 'react';
import { appAuthController } from '../app-auth';
import type { AuthMe } from '../auth';

/**
 * Read the current auth snapshot from anywhere in the tree.
 *
 * Mirrors the root subscription in `main.tsx` so components rendered outside a
 * route context (shared, reusable components) can react to identity changes
 * without threading the snapshot through props.
 */
export function useAuthSnapshot(): AuthMe | null {
	return useSyncExternalStore(
		appAuthController.subscribe,
		() => appAuthController.snapshot,
		() => appAuthController.snapshot,
	);
}
