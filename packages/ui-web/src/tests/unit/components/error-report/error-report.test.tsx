/** @vitest-environment jsdom */
/**
 * The report's `Time` row reads the same on every machine.
 *
 * It was `new Date().toLocaleString()`, so the row a person pasted into a
 * support thread was worded in whatever locale their browser ran, which is the
 * drift #683 swept out of `apps/web/src` and #1116 widened to the modules that
 * draw for it. The row is asserted as the `en-US` string, because under `en-GB`
 * the same instant renders `04/03/2026, 21:05:09`. The clock is pinned and the
 * zone is UTC so the literal is one value and not a machine's.
 *
 * jsdom because the facts read `window.location` and the headline reads
 * `navigator.onLine`; `error-report-text.test.ts` beside this covers the copied
 * report and needs neither.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorReport } from '../../../../components/error-report/error-report';

describe('the error report time row', () => {
	let zone: string | undefined;

	beforeEach(() => {
		zone = process.env.TZ;
		process.env.TZ = 'UTC';
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-04T21:05:09Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
		// Put the zone back: a worker can run another file after this one.
		if (zone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = zone;
		}
	});

	it('names the moment in en-US wording whatever the machine locale', () => {
		const markup = renderToStaticMarkup(
			<ErrorReport error={new Error('boom')} title="The page did not load" version="0.3.0" />,
		);

		expect(markup).toContain('>3/4/2026, 9:05:09 PM<');
	});
});
