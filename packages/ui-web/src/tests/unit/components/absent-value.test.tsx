/**
 * What a table cell announces when the record carries no value there.
 *
 * The glyph is settled and no screen changes, so the cases worth writing are
 * the ones about the announcement. Twenty-eight sites drew this dash: sixteen
 * went through a component that named itself with `title`, which paints a hover
 * tooltip and is a weak accessible name, and the other twelve wrote the
 * character themselves and named it nothing at all. These hold the label to
 * `aria-label` and to the same words `DetailRow` shows.
 *
 * Rendered to a string rather than into a DOM, the way `detail-row.test.tsx`
 * does: the component reads no props and returns markup, so `react-dom/server`
 * is enough and `ui-web` stays off a jsdom dependency.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AbsentValue } from '../../../components/absent-value';

const markup = (): string => renderToStaticMarkup(<AbsentValue />);

describe('AbsentValue', () => {
	it('draws the em dash, which is the marker every screen already shows', () => {
		expect(markup()).toContain('—');
	});

	it('names itself "Not recorded", the same words DetailRow reads', () => {
		expect(markup()).toContain('aria-label="Not recorded"');
	});

	it('is an image to assistive technology, so nothing announces the character', () => {
		expect(markup()).toContain('role="img"');
	});

	it('sets no title, which would paint a hover tooltip and name it weakly', () => {
		expect(markup()).not.toContain('title=');
	});
});
