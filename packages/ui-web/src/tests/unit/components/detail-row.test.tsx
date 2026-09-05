/**
 * What a detail row says when the record carries no value.
 *
 * The sixteen copies this replaced left the answer to the caller, and the
 * callers disagreed: "—", "Not set", and a helper called `orNotSet` that
 * rendered a dash on one page and "Not set" on another. The rule is here now,
 * so these are the cases that decide what a reader sees.
 *
 * Rendered to a string rather than into a DOM. The component reads props and
 * returns markup, `react-dom/server` is enough to see the markup, and it keeps
 * `ui-web` off a jsdom dependency it otherwise has no use for.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DetailRow } from '../../../components/detail-row';

const render = (element: React.ReactElement): string => renderToStaticMarkup(element);

describe('DetailRow', () => {
	it('reads "Not recorded" for a value the record does not carry', () => {
		expect(render(<DetailRow label="Lure">{null}</DetailRow>)).toContain('Not recorded');
	});

	it('treats undefined the same as null', () => {
		expect(render(<DetailRow label="Lure">{undefined}</DetailRow>)).toContain('Not recorded');
	});

	it('treats a blank string as no value, not as a value that is blank', () => {
		// A column the record has but never filled reads on screen as an empty row,
		// so it should say the same thing a null one does.
		expect(render(<DetailRow label="Company">{'   '}</DetailRow>)).toContain('Not recorded');
	});

	it('treats the false left behind by a short-circuit as no value', () => {
		const flag = false;
		expect(render(<DetailRow label="Lure">{flag && 'BG-Lure'}</DetailRow>)).toContain(
			'Not recorded',
		);
	});

	it('says what the caller asked when the absence means something more specific', () => {
		const markup = render(
			<DetailRow empty="Unassigned" label="Technician">
				{null}
			</DetailRow>,
		);
		expect(markup).toContain('Unassigned');
		expect(markup).not.toContain('Not recorded');
	});

	it('never writes an em dash, which docs/writing-style.md bans from screen copy', () => {
		expect(render(<DetailRow label="Lure">{null}</DetailRow>)).not.toContain('—');
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
