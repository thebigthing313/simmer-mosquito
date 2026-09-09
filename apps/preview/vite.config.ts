import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { compilerIncludes } from '../../scripts/lib/compiler-phases.mjs';

/*
 * The React Compiler pass, from phase 2 of the rollout charted in #649.
 *
 * The full reason for the three packages and the plugin order is in
 * `apps/admin/vite.config.ts`, which wired this first. What matters here is the
 * filter: it is `COMPILER_PHASES`, the whole allowlist rather than this app's
 * slice of it, because `packages/ui-web` is compiled by whichever app imports it
 * and an app filtering to its own root would compile a shared component in one
 * consumer and not the next. This app's own `src` is not on that list yet, so
 * the pass runs over the ui-web modules it imports and nothing else.
 */
const compilerPreset = reactCompilerPreset();
compilerPreset.rolldown.filter = {
	...compilerPreset.rolldown.filter,
	id: { include: compilerIncludes() },
};

export default defineConfig({
	envDir: '../..',
	plugins: [
		TanStackRouterVite({ autoCodeSplitting: true }),
		react(),
		babel({ presets: [compilerPreset] }),
		tailwindcss(),
	],
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
});
