import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { compilerIncludes } from '../../scripts/lib/compiler-phases.mjs';
import { version } from './package.json' with { type: 'json' };

/*
 * The React Compiler pass, from phase 2 of the rollout charted in #649.
 *
 * The full reason for the three packages and the plugin order is in
 * `apps/admin/vite.config.ts`, which wired this first. What matters here is the
 * filter: it is `COMPILER_PHASES`, the whole allowlist rather than this app's
 * slice of it, because `packages/ui-web` is compiled by whichever app imports it
 * and an app filtering to its own root would compile a shared component in one
 * consumer and not the next. This app's own `src` joined that list over phases 3
 * to 7, so the pass now runs over `lib`, `hooks`, `components`, `routes` and
 * `forms` here as well as over the ui-web modules this app imports.
 */
const compilerPreset = reactCompilerPreset();
compilerPreset.rolldown.filter = {
	...compilerPreset.rolldown.filter,
	id: { include: compilerIncludes() },
};

/** A `components/<surface>/index.ts` barrel, which holds re-exports and nothing else. */
const BARREL = /[\\/]apps[\\/]web[\\/]src[\\/]components[\\/][^\\/]+[\\/]index\.ts$/;

export default defineConfig({
	envDir: '../..',
	plugins: [
		TanStackRouterVite({ autoCodeSplitting: true }),
		react(),
		babel({ presets: [compilerPreset] }),
		tailwindcss(),
	],
	/*
	 * The version the sidebar shows and the changelog page badges. It is inlined
	 * at build rather than read at runtime because production is a Caddy image
	 * with no Node process in it — there is nothing there to serve a version
	 * endpoint, and `package.json` is not in the document root. Sourcing it from
	 * this file's own package.json means `changeset version` is the only thing
	 * that ever moves the number.
	 */
	define: {
		__APP_VERSION__: JSON.stringify(version),
	},
	/*
	 * The one thing every suite here needs that no suite sets up for itself: a
	 * session transport, which `packages/sync` refuses to send without (#694).
	 * The app installs one at module scope in `app-auth.ts`; the setup file
	 * installs one that defers to whatever a case stubbed. See the file.
	 *
	 * This block is why `defineConfig` comes from `vitest/config` rather than
	 * from `vite`: vite's own type has no `test` key. The shipped build reads
	 * this file too, and the image builds with devDependencies in place, so
	 * nothing about production changes.
	 */
	test: {
		setupFiles: ['./src/tests/session-transport.ts'],
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		rolldownOptions: {
			/*
			 * The `components/*` barrels only re-export, so nothing is lost by
			 * telling the bundler so. Without it, a route file that kept one name
			 * from a barrel for its `validateSearch` after code splitting kept the
			 * whole barrel at boot: every module behind `components/map` and
			 * `components/explorer` has top-level reads the bundler cannot prove
			 * pure, so all of them rode in the entry chunk, `MapCanvas` included.
			 * That was 157 KB of the 1.28 MB entry. The rule is the file shape
			 * `components/<surface>/index.ts`; a barrel that grows a statement of
			 * its own has to move out of that shape first.
			 */
			treeshake: {
				moduleSideEffects: (id: string) => !BARREL.test(id),
			},
			output: {
				/*
				 * mapbox-gl stays out of the entry because `mapbox-gl-loader.ts`
				 * imports it dynamically, and the ~60 other imports are
				 * `import type`. The one group here is React itself, anchored on
				 * the package directory so `lucide-react` and the other
				 * `*-react` packages stay with whatever imports them.
				 */
				codeSplitting: {
					groups: [
						{
							name: 'react-vendor',
							test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
						},
					],
				},
			},
		},
	},
});
