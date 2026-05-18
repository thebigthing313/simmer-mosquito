import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	envDir: '../..',
	plugins: [react(), tailwindcss()],
	build: {
		outDir: 'dist',
		emptyOutDir: true,
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
