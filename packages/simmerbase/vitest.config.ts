import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

export default defineConfig({
	test: {
		globals: true,
		testTimeout: 30000,
		hookTimeout: 30000,
		include: ['src/tests/**/*.test.ts'],
		reporters: ['verbose'],
		sequence: {
			concurrent: false,
		},
	},
});
