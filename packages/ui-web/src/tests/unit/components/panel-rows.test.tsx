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

const EMPTY = { description: 'No specimens were collected.', title: 'No Samples Recorded' };
const UNAVAILABLE = { description: 'Try again shortly.', title: 'Samples Unavailable' };

const markup = (reading: PanelRowsReading<string>): string =>
	renderToStaticMarkup(
		<PanelRows
			empty={EMPTY}
			icon={<svg aria-hidden="true" />}
			reading={reading}
			unavailable={UNAVAILABLE}
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

	it('leaves the rows unwrapped when the card brings its own table', () => {
		const html = renderToStaticMarkup(
			<PanelRows
				empty={EMPTY}
				icon={<svg aria-hidden="true" />}
				reading={{ isReady: true, rows: ROWS }}
				unavailable={UNAVAILABLE}
				wrap="none"
			>
				{(rows) => (
					<table>
						{rows.map((row) => (
							<caption key={row}>{row}</caption>
						))}
					</table>
				)}
			</PanelRows>,
		);

		expect(html).toContain('<table');
		expect(html).not.toContain('<ul');
	});
});

/**
 * The fifth branch, for the card whose record answers for its own children.
 *
 * Ranked below the failure and the placeholder and above the count, which is
 * the pair of cases below: a zero-result collection still holding a species row
 * that has not synced away reads as a zero result and not as a list of one.
 */
describe('PanelRows with a message standing in for the rows', () => {
	const stood = (reading: PanelRowsReading<string>): string =>
		renderToStaticMarkup(
			<PanelRows
				empty={EMPTY}
				icon={<svg aria-hidden="true" />}
				instead={{ description: 'Turn off zero result to record species.', title: 'Zero Result' }}
				reading={reading}
				unavailable={UNAVAILABLE}
			>
				{(rows) => rows.map((row) => <li key={row}>{row}</li>)}
			</PanelRows>,
		);

	it('outranks the rows', () => {
		const html = stood({ isReady: true, rows: ROWS });

		expect(html).toContain('Zero Result');
		expect(html).not.toContain('Sample 1');
	});

	it('outranks the empty state, which says something else', () => {
		const html = stood({ isReady: true, rows: [] });

		expect(html).toContain('Zero Result');
		expect(html).not.toContain('No Samples Recorded');
	});

	it('waits for the read, so a card does not answer before its record has', () => {
		expect(stood({ isReady: false, rows: [] })).toContain('data-slot="skeleton"');
	});

	it('gives way to a failed read', () => {
		expect(stood({ isError: true, isReady: true, rows: [] })).toContain('Samples Unavailable');
	});
});

/**
 * `IdentificationCard` draws its add row and disposition controls for a sample
 * nobody has keyed out, so its zero-row state is not a card-level empty.
 */
describe('PanelRows with no empty state', () => {
	it('hands zero rows to the card, which owns what they say', () => {
		const html = renderToStaticMarkup(
			<PanelRows
				icon={<svg aria-hidden="true" />}
				reading={{ isReady: true, rows: [] }}
				unavailable={UNAVAILABLE}
			>
				{(rows) => <p>{rows.length === 0 ? 'No species identified yet.' : 'Some'}</p>}
			</PanelRows>,
		);

		expect(html).toContain('No species identified yet.');
	});
});
