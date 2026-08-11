import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { version } from './package.json' with { type: 'json' };

export default defineConfig({
	envDir: '../..',
	plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react(), tailwindcss()],
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
