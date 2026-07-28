import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	envDir: '../..',
	plugins: [TanStackRouterVite({ autoCodeSplitting: true }), react(), tailwindcss()],
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
	...readPreviewConfig(),
});

function readPreviewConfig():
	| {
			readonly preview: {
				readonly allowedHosts: string[];
			};
	  }
	| Record<string, never> {
	const allowedHosts = [
		process.env.RAILWAY_PUBLIC_DOMAIN,
		process.env.VITE_PREVIEW_ALLOWED_HOSTS,
		process.env.PREVIEW_ALLOWED_HOSTS,
	]
		.flatMap((value) => (value ?? '').split(','))
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	if (allowedHosts.length === 0) {
		return {};
	}

	return {
		preview: {
			allowedHosts,
		},
	};
}
