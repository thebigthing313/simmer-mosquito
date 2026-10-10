/** @vitest-environment jsdom */
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StopReorderControls } from '../../../../components/stop-order';

/**
 * The move buttons work out the ends of the list from the stop's index and the
 * list's length, which every caller used to compute and pass in (#1578).
 */
afterEach(cleanup);

function renderAt(index: number, count: number) {
	render(
		<TooltipProvider>
			<StopReorderControls count={count} index={index} onMove={() => {}} />
		</TooltipProvider>,
	);
	return {
		up: screen.getByRole('button', { name: 'Move up' }) as HTMLButtonElement,
		down: screen.getByRole('button', { name: 'Move down' }) as HTMLButtonElement,
	};
}

describe('StopReorderControls', () => {
	it('disables Move up on the first stop', () => {
		const { up, down } = renderAt(0, 3);

		expect(up.disabled).toBe(true);
		expect(down.disabled).toBe(false);
	});

	it('disables Move down on the last stop', () => {
		const { up, down } = renderAt(2, 3);

		expect(up.disabled).toBe(false);
		expect(down.disabled).toBe(true);
	});

	it('leaves both open on a stop in the middle', () => {
		const { up, down } = renderAt(1, 3);

		expect(up.disabled).toBe(false);
		expect(down.disabled).toBe(false);
	});

	it('disables both on the only stop', () => {
		const { up, down } = renderAt(0, 1);

		expect(up.disabled).toBe(true);
		expect(down.disabled).toBe(true);
	});
});
