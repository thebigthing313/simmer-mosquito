import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.js';

/**
 * The shared config, plus the setup files that give every suite here a
 * `ResizeObserver` (#1279) and the layout and pointer methods (#1307), which
 * jsdom does not have and Radix needs.
 */
export default mergeConfig(
	shared,
	defineConfig({
		test: {
			setupFiles: ['./src/tests/resize-observer.ts', './src/tests/jsdom-shims.ts'],
		},
	}),
);
