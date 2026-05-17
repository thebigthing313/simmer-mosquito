import { spawn } from 'node:child_process';

const port = process.env.PORT ?? '4174';
const child = spawn(
	process.platform === 'win32' ? 'npx.cmd' : 'npx',
	['vite', 'preview', '--host', '0.0.0.0', '--port', port],
	{
		stdio: 'inherit',
	},
);

child.on('exit', (code, signal) => {
	if (signal !== null) {
		process.kill(process.pid, signal);
		return;
	}

	process.exit(code ?? 0);
});
