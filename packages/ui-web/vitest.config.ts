import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.js';

/**
 * The shared config, plus the setup file that gives every suite here a
 * `ResizeObserver`, which jsdom does not have and Radix needs (#1279).
 */
export default mergeConfig(
	shared,
	defineConfig({
		test: {
			setupFiles: ['./src/tests/resize-observer.ts'],
		},
	}),
);
