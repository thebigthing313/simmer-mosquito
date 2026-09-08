import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { compilerIncludes } from '../../scripts/lib/compiler-phases.mjs';
import { version } from './package.json' with { type: 'json' };

/*
 * The React Compiler pass, phase 1 of the rollout charted in #649.
 *
 * `reactCompilerPreset` is not a plugin. It returns a preset that
 * `@rolldown/plugin-babel` runs, which is why three packages are in
 * `devDependencies` rather than one: `@babel/core` is a non-optional peer of
 * that plugin and nothing else was going to install it, since this pipeline had
 * no Babel at all before this commit. `@vitejs/plugin-react` transforms JSX with
 * oxc, so the compiler is a second parse rather than a step on an existing one.
 *
 * `compilationMode` and `target` are both written nowhere. `infer` is the
 * default and the mode #656 settled on, and `target: '19'` is the default too,
 * with the runtime built into React 19, so naming either would be a second
 * spelling of a default that could drift.
 *
 * Which paths it runs over is `COMPILER_PHASES`, the register the bail-out gate
 * reads, so what is compiled and what is gated cannot disagree. Handing the
 * whole allowlist to every app is the point: `packages/ui-web` is compiled by
 * whichever app imports it, and an app filtering to its own root would compile a
 * shared component in one consumer and not the next.
 */
const compilerPreset = reactCompilerPreset();
compilerPreset.rolldown.filter = {
	...compilerPreset.rolldown.filter,
	id: { include: compilerIncludes() },
};

export default defineConfig({
	envDir: '../..',
	/*
	 * `babel()` goes after the router plugin, not before. The router's
	 * code-splitter rewrites a route module into virtual files, so a compiler
	 * pass in front of it would read source the build then throws away. Its own
	 * plugin-order guard does not know about `@rolldown/plugin-babel` and will
	 * not catch the mistake.
	 */
	plugins: [
		TanStackRouterVite({ autoCodeSplitting: true }),
		react(),
		babel({ presets: [compilerPreset] }),
		tailwindcss(),
	],
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
	 *
	 * The compiler pass runs here too, on every jsdom suite, because vitest reads
	 * this file and the plugin applies to the client environment. That is #776's
	 * measurement and it is deliberate: the suites should exercise the code the
	 * browser gets.
	 */
	test: {
		setupFiles: ['./src/tests/session-transport.ts'],
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
	},
});
