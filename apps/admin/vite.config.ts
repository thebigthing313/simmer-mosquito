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
	},
});
