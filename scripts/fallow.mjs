// Wrapper around the `fallow` CLI that makes `--type-aware` work on Windows,
// and that turns the health baseline's staleness warning into a gate.
//
// fallow's semantic pass runs in a sidecar process, which fallow spawns using
// the path in that package's `bin` field: `fallow-type-aware.mjs`. On Unix the
// shebang makes that file directly executable. Windows has no shebang handling,
// so CreateProcess rejects it outright:
//
//   failed to spawn ...\fallow-type-aware.mjs:
//   %1 is not a valid Win32 application. (os error 193)
//
// fallow ignores `node_modules/.bin` when locating the sidecar, but it does
// honour FALLOW_TYPE_AWARE_BIN — so on Windows we hand it the pnpm-generated
// `.CMD` shim, which runs the same file through node. `fallow-type-aware` is a
// direct devDependency for exactly this reason: pnpm only links the bins of
// direct dependencies into the root `.bin`. Keep its version in lockstep with
// `fallow` itself.
//
// Every other platform gets no override and spawns fallow unchanged.
//
// The staleness half is #360. A saved baseline entry that matches no current
// finding is allowance nothing is using: the file it names was cleaned up, so a
// new finding there lands inside the old headroom and the gate stays quiet.
// `fallow health --baseline` warns about that, prints the warning second, ahead
// of 1500 lines of report, and exits 0, which is how the baseline sat five days
// with 358 of its 658 entries matching nothing. So the warning is the gate: it
// gets reprinted under the report, where the result line is read, and it fails
// the run. There is no quieter staleness for this to be strict about, because
// fallow says nothing until a quarter of the saved entries match nothing.
import { spawn } from 'node:child_process';

const STALENESS_PATTERN = /health baseline is partially stale: \d+ of \d+ entries/;

const env = { ...process.env };

if (process.platform === 'win32') {
	env.FALLOW_TYPE_AWARE_BIN ??= 'node_modules/.bin/fallow-type-aware.CMD';
}

// Reading the child's output costs it the TTY it would otherwise inherit, so
// ask for colour by both of the conventional variables; fallow prints what it
// prints under a pipe if it honours neither.
if (process.stdout.isTTY) {
	env.FORCE_COLOR ??= '1';
	env.CLICOLOR_FORCE ??= '1';
}

const child = spawn('fallow', process.argv.slice(2), {
	stdio: ['inherit', 'pipe', 'pipe'],
	shell: true,
	env,
});

/** The staleness warning fallow printed, if it printed one. @type {string | null} */
let warning = null;

const readLine = (line) => {
	if (STALENESS_PATTERN.test(line)) warning = line.trim();
};

// Bytes reach the terminal untouched; only whole lines are scanned, so a
// warning split across two chunks is still read.
const scan = (source, sink) => {
	let carry = '';
	source.on('data', (chunk) => {
		sink.write(chunk);
		const lines = (carry + chunk).split('\n');
		carry = lines.pop() ?? '';
		for (const line of lines) readLine(line);
	});
	source.on('end', () => readLine(carry));
};

scan(child.stdout, process.stdout);
scan(child.stderr, process.stderr);

// Setting `exitCode` rather than calling `process.exit` lets the writes above
// drain; nothing holds the loop open once the child has closed. A child killed
// by a signal reports a null code, which is a failure like any other.
child.on('close', (code) => {
	process.exitCode = code ?? 1;
	if (!warning) return;

	console.error(`\n${warning}`);
	console.error(
		'Re-save it with `pnpm fallow:baseline` and read the diff before committing: a re-save is also how a regression gets buried.',
	);
	process.exitCode = 1;
});
