import { setInterval } from 'node:timers';
import { readEnv } from '@simmer-mosquito/config';
import { calculateTrapNightRate } from '@simmer-mosquito/domain';

const env = readEnv();
const intervalMs = 60_000;

async function runSurveillanceCycle(): Promise<void> {
	const sampleRate = calculateTrapNightRate({
		mosquitoCount: 42,
		trapNights: 7,
	});

	console.log(
		JSON.stringify({
			event: 'surveillance_cycle_completed',
			environment: env.nodeEnv,
			sampleRate,
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
