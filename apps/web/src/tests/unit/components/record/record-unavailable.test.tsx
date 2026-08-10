/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordUnavailable } from '../../../../components/record/record-unavailable';

/**
 * The two things this component exists to settle, and which twenty-odd
 * hand-written copies had each settled for themselves.
 */
describe('RecordUnavailable', () => {
	afterEach(cleanup);

	// About half the copies hard-coded one message for both cases, so a
	// transient sync failure and a permissions refusal read identically — and
	// the reader has no way to tell "wait" from "stop looking".
	it('tells a load failure apart from a record that is not there', () => {
		const { rerender } = render(<RecordUnavailable noun="collection" reason="error" />);
		expect(
			screen.getByText('This collection could not be loaded. Try again shortly.'),
		).toBeTruthy();

		rerender(<RecordUnavailable noun="collection" reason="not-found" />);
		expect(
			screen.getByText('This collection could not be found, or you do not have access to it.'),
		).toBeTruthy();
	});

	it('titles itself from the noun, in the words the record is called', () => {
		render(<RecordUnavailable noun="service request" reason="not-found" />);

		expect(screen.getByText('Service Request Unavailable')).toBeTruthy();
	});

	it('lets a page say something more specific than either default', () => {
		render(
			<RecordUnavailable
				description="This application's personnel and batches could not be loaded."
				noun="application"
				reason="error"
			/>,
		);

		expect(
			screen.getByText("This application's personnel and batches could not be loaded."),
		).toBeTruthy();
		expect(screen.queryByText(/Try again shortly/)).toBeNull();
	});

	// The other inconsistency: the same state was vertically centred on some
	// routes and top-aligned on others, with nothing deciding which. It now
	// follows from the kind of route — an edit pane has no chrome to sit under.
	it('centres itself only where the route has no chrome of its own', () => {
		// The centring wrapper is the full-height pane; `Empty` does its own
		// internal centring either way, so the selector has to be the outer div.
		const { container, rerender } = render(<RecordUnavailable noun="trap" reason="not-found" />);
		expect(container.querySelector('div.h-full.min-h-0')).toBeNull();

		rerender(<RecordUnavailable layout="centered" noun="trap" reason="not-found" />);
		expect(container.querySelector('div.h-full.min-h-0')).not.toBeNull();
	});
});
