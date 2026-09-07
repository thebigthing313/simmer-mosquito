/**
 * What the one search box draws, and what it refuses to draw.
 *
 * Sixteen places rendered this affordance and eight of them were hand copies of
 * two components. Three copies had dropped the clear button, which is why the
 * trailing slot is typed rather than optional: a box carries either `onClear` or
 * an `endAddon`, and a copy that carries neither no longer compiles.
 *
 * Rendered to a string rather than into a DOM, the way `detail-row.test.tsx`
 * does. These cases are about the markup, and it keeps `ui-web` off a jsdom
 * dependency it otherwise has no use for. The click path is asserted in
 * `apps/web`, over a debounced caller, where the bug was.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SearchInput } from '../../../components/search-input';

const render = (element: React.ReactElement): string => renderToStaticMarkup(element);

describe('SearchInput', () => {
	it('names the box with the label', () => {
		expect(
			render(<SearchInput label="Search traps by name or code" onClear={() => {}} value="" />),
		).toContain('aria-label="Search traps by name or code"');
	});

	it('offers no clear control until there is something to clear', () => {
		expect(render(<SearchInput label="Search traps" onClear={() => {}} value="" />)).not.toContain(
			'Clear search',
		);
	});

	it('draws the clear control once the box has a value', () => {
		expect(render(<SearchInput label="Search traps" onClear={() => {}} value="bg" />)).toContain(
			'aria-label="Clear search"',
		);
	});

	it("leaves the trailing slot to a caller's own control", () => {
		// The record pickers clear the selection rather than the text, so their
		// button has to show against the selection and not against the value.
		const markup = render(
			<SearchInput
				endAddon={<button type="button">Clear habitat</button>}
				label="Search habitats"
				value="pond"
			/>,
		);

		expect(markup).toContain('Clear habitat');
		expect(markup).not.toContain('aria-label="Clear search"');
	});
});
