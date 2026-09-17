/**
 * What a detail row says when the record carries no value.
 *
 * The sixteen copies this replaced left the answer to the caller, and the
 * callers disagreed: "—", "Not set", and a helper called `orNotSet` that
 * rendered a dash on one page and "Not set" on another. The rule is here now,
 * so these are the cases that decide what a reader sees.
 *
 * The answer is `AbsentValue`, the em dash a column and a list already draw, so
 * every case below asserts both halves of it: the mark on screen and the
 * "Not recorded" it carries as its accessible name.
 *
 * Rendered to a string rather than into a DOM. The component reads props and
 * returns markup, `react-dom/server` is enough to see the markup, and it keeps
 * `ui-web` off a jsdom dependency it otherwise has no use for.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetailRow } from '../../../components/detail-row';

const render = (element: React.ReactElement): string => renderToStaticMarkup(element);

/** The mark on screen, and the words assistive technology is handed for it. */
function expectAbsent(markup: string): void {
	expect(markup).toContain('—');
	expect(markup).toContain('Not recorded');
}

describe('DetailRow', () => {
	it('draws the absent mark for a value the record does not carry', () => {
		expectAbsent(render(<DetailRow label="Lure">{null}</DetailRow>));
	});

	it('treats undefined the same as null', () => {
		expectAbsent(render(<DetailRow label="Lure">{undefined}</DetailRow>));
	});

	it('treats a blank string as no value, not as a value that is blank', () => {
		// A column the record has but never filled reads on screen as an empty row,
		// so it should say the same thing a null one does.
		expectAbsent(render(<DetailRow label="Company">{'   '}</DetailRow>));
	});

	it('treats the false left behind by a short-circuit as no value', () => {
		const flag = false;
		expectAbsent(render(<DetailRow label="Lure">{flag && 'BG-Lure'}</DetailRow>));
	});

	it('draws one mark for every absence, whatever the row is about', () => {
		// The rows that used to name their own absence: "Unassigned" for a person,
		// "Pending" for a date, "Unfiled" for a folder. Thirteen spellings of
		// nothing across twenty-two rows, and a reader scanning a card for what is
		// missing had to read each one to learn that the answer was nothing.
		const technician = render(<DetailRow label="Technician">{null}</DetailRow>);
		const folder = render(<DetailRow label="Folder">{null}</DetailRow>);
		expectAbsent(technician);
		expect(folder.replace('Folder', 'Technician')).toBe(technician);
	});

	it('renders the value it was given, and the label beside it', () => {
		const markup = render(<DetailRow label="Method">BG-Sentinel</DetailRow>);
		expect(markup).toContain('BG-Sentinel');
		expect(markup).toContain('Method');
		expect(markup).not.toContain('Not recorded');
	});

	it('renders a zero rather than calling it absent', () => {
		// `0` is a count a record does carry, and `??`-style guards in the copies
		// this replaced would have kept it. Nothing here may turn it into a dash.
		const markup = render(<DetailRow label="Dips">{0}</DetailRow>);
		expect(markup).toContain('0');
		expect(markup).not.toContain('Not recorded');
	});
});
