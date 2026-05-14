import { setInterval } from 'node:timers';
import { readEnv } from '@simmer-mosquito/config';

const env = readEnv();
const intervalMs = 60_000;

async function runSurveillanceCycle(): Promise<void> {
	console.log(
		JSON.stringify({
			event: 'worker_heartbeat',
			environment: env.nodeEnv,
		}),
	);
}

if (process.env.RUN_ONCE === 'true') {
	await runSurveillanceCycle();
} else {
	await runSurveillanceCycle();
	setInterval(() => {
		void runSurveillanceCycle();
	}, intervalMs);
}
