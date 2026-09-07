import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { version } from './package.json' with { type: 'json' };

export default defineConfig({
	envDir: '../..',
	plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react(), tailwindcss()],
	/*
	 * Inlined at build for the same reason as the workspace app: production runs
	 * Caddy and no Node, so there is nothing to ask at runtime. See
	 * apps/web/vite.config.ts.
	 */
	define: {
		__APP_VERSION__: JSON.stringify(version),
	},
	/*
	 * A session transport for every suite, which `packages/sync` refuses to send
	 * without (#694). Same setup file and same reason as apps/web, including why
	 * `defineConfig` comes from `vitest/config`.
	 */
	test: {
		setupFiles: ['./src/tests/session-transport.ts'],
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
});
