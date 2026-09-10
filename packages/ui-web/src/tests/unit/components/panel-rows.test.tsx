/**
 * The fork the seven child-record cards each wrote by hand, and which was
 * asserted nowhere.
 *
 * Its order is the whole of it, and the cases below are the pairs that can be
 * true at once: a read that failed is not an empty card, and a read that has
 * not answered is neither. `record-detail-page.test.tsx` in `apps/web` holds
 * the same order one level up, over the record instead of over its children.
 *
 * Rendered to a string rather than into a DOM, the way `detail-row.test.tsx`
 * does: these cases are about which markup comes back, and it keeps `ui-web`
 * off a jsdom dependency.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelRows, type PanelRowsReading } from '../../../components/panel-rows';

const markup = (reading: PanelRowsReading<string>): string =>
	renderToStaticMarkup(
		<PanelRows
			empty={{ description: 'No specimens were collected.', title: 'No Samples Recorded' }}
			icon={<svg aria-hidden="true" />}
			reading={reading}
			unavailable={{ description: 'Try again shortly.', title: 'Samples Unavailable' }}
		>
			{(rows) => rows.map((row) => <li key={row}>{row}</li>)}
		</PanelRows>,
	);

const ROWS = ['Sample 1', 'Sample 2'];

describe('PanelRows', () => {
	it('stands in for the rows while the read is still answering', () => {
		const html = markup({ isReady: false, rows: [] });

		expect(html).toContain('data-slot="skeleton"');
		expect(html).not.toContain('No Samples Recorded');
		expect(html).not.toContain('Samples Unavailable');
	});

	// The distinction that had gone missing everywhere: an empty read tells the
	// reader there is nothing to find, which is the wrong answer for a read that
	// has not landed.
	it('says the card is empty only once the read has answered', () => {
		const html = markup({ isReady: true, rows: [] });

		expect(html).toContain('No Samples Recorded');
		expect(html).toContain('No specimens were collected.');
		expect(html).not.toContain('data-slot="skeleton"');
	});

	it('says a failed read failed, whatever the read holds', () => {
		const html = markup({ isError: true, isReady: true, rows: ROWS });

		expect(html).toContain('Samples Unavailable');
		expect(html).not.toContain('Sample 1');
	});

	// `isError` outranks readiness too. A card drawing the placeholder for a read
	// that already failed is waiting for something that is not coming.
	it('prefers the failure to the placeholder', () => {
		const html = markup({ isError: true, isReady: false, rows: [] });

		expect(html).toContain('Samples Unavailable');
		expect(html).not.toContain('data-slot="skeleton"');
	});

	it('draws the rows once there are rows', () => {
		const html = markup({ isReady: true, rows: ROWS });

		expect(html).toContain('Sample 1');
		expect(html).toContain('Sample 2');
		expect(html).not.toContain('No Samples Recorded');
	});

	it('wraps the rows in the list, so a card supplies items and nothing else', () => {
		expect(markup({ isReady: true, rows: ROWS })).toContain('<ul');
	});
});
