import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.js';

/**
 * The shared config, plus the one thing a React Native package tree needs.
 *
 * Metro resolves a `.web.js` beside a `.js` when it bundles for web, and Expo
 * ships both. Without that rule a suite importing `auth-context.tsx` reaches
 * `expo-secure-store`, then `expo-modules-core`, then `react-native`, whose
 * entry is Flow and which the bundler refuses to parse. The `.web.js` Expo
 * publishes beside the native binding is `export default {}`, which is all a
 * suite that never touches the keystore needs.
 *
 * Teaching the resolver that platform extension is what lets a test reach this
 * app's own logic through a native module, using Expo's published build rather
 * than a stub of ours, and it is why nothing here has to mock a module path.
 *
 * The default list is restated after the web entries because `resolve.extensions`
 * replaces it rather than adding to it.
 */
export default mergeConfig(
	shared,
	defineConfig({
		resolve: {
			extensions: [
				'.web.mjs',
				'.web.js',
				'.web.mts',
				'.web.ts',
				'.web.jsx',
				'.web.tsx',
				'.web.json',
				'.mjs',
				'.js',
				'.mts',
				'.ts',
				'.jsx',
				'.tsx',
				'.json',
			],
		},
	}),
);
