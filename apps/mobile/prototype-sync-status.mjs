// PROTOTYPE, throwaway (#1348). Starts Expo with the sync status prototype in
// place of the app. Pass --web to open it in a browser instead of Expo Go.
import { spawn } from 'node:child_process';

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
	stdio: 'inherit',
	shell: true,
	env: { ...process.env, EXPO_PUBLIC_PROTOTYPE: 'sync-status' },
});
child.on('exit', (code) => process.exit(code ?? 0));
