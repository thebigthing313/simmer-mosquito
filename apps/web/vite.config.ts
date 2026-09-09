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
			output: {
				/*
				 * Route splitting alone left a 2.7 MB entry chunk — 65% of all the
				 * JS we ship — because a dependency shared by many lazy route
				 * chunks gets hoisted into the common chunk that every route needs.
				 * mapbox-gl is the extreme case: it is reachable only from map
				 * routes, but enough of them import it that it was promoted into
				 * the boot payload, so a operator opening a table or settings page
				 * downloaded and parsed a map renderer to get there.
				 *
				 * Pulling it into its own group keeps it a static dependency of the
				 * map route chunks and nothing else, so the browser fetches it when
				 * a map route loads instead of at boot. Only two files import it as
				 * a value (`use-mapbox-map`, `geolocate-control`); the other ~59
				 * imports are `import type` and erase at compile time.
				 */
				codeSplitting: {
					groups: [
						{
							name: 'react-vendor',
							test: /[\\/]node_modules[\\/].*(react|react-dom|scheduler)[\\/]/,
						},
					],
				},
			},
		},
	},
});
