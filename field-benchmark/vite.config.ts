import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	// Relative asset paths, so the same build loads from https://localhost in
	// Capacitor and from app://bench in Electron.
	base: './',
	worker: { format: 'es' },
	build: {
		target: 'es2022',
		sourcemap: true,
	},
	server: { port: 5199, host: true },
});
