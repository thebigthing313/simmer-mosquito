/** @vitest-environment jsdom */

/**
 * What an undeclared metadata key reads as, which depends on the surface and not
 * on the entry.
 *
 * `customFieldEntries` marks any key the schema does not declare `declared:
 * false`, and both cases arrive that way: a field dropped from a method's schema,
 * and a note somebody typed into a habitat. The habitat form is the only one in
 * `apps/web` that sets `allowExtra` on its `MetadataField`, so it is the only
 * surface where the second case exists, and `allowsExtraKeys` is how its detail
 * page says so. Badging a note Retired tells a reader the value is historical
 * when it is current (#773).
 */

import { customFieldEntries } from '@simmer-mosquito/ui-web/components/form';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CustomFieldsCard, CustomFieldsList } from '../../../components/custom-fields-card';

/** The flat shape the schema editor writes, one declared text field. */
const schema = {
	waterDepth: { label: 'Water Depth', order: 0, type: 'text', required: false },
};

const entries = (metadata: Record<string, unknown>) => customFieldEntries(schema, metadata);

// This app's vitest run sets no globals, so nothing unmounts a render for us and
// a second one would leave two copies of the same label in the document.
afterEach(cleanup);

describe('an undeclared key', () => {
	it('reads Retired where the surface declares nothing', () => {
		render(<CustomFieldsList entries={entries({ waterDepth: '4', fieldNotes: 'Culverted' })} />);

		expect(screen.getByText('Field Notes')).toBeTruthy();
		expect(screen.getByText('Retired')).toBeTruthy();
	});

	it('draws no badge where the surface accepts extra keys', () => {
		render(
			<CustomFieldsList
				allowsExtraKeys
				entries={entries({ waterDepth: '4', fieldNotes: 'Culverted' })}
			/>,
		);

		expect(screen.getByText('Field Notes')).toBeTruthy();
		expect(screen.getByText('Culverted')).toBeTruthy();
		expect(screen.queryByText('Retired')).toBeNull();
	});

	it('reads Retired through the card, which passes nothing', () => {
		render(<CustomFieldsCard metadata={{ fieldNotes: 'Culverted' }} schema={schema} />);

		expect(screen.getByText('Retired')).toBeTruthy();
	});
});

describe('a declared key', () => {
	it('reads Not recorded with no value, where the surface declares nothing', () => {
		render(<CustomFieldsList entries={entries({})} />);

		expect(screen.getByText('Not recorded')).toBeTruthy();
		expect(screen.queryByText('Retired')).toBeNull();
	});

	it('reads Not recorded with no value, where the surface accepts extra keys', () => {
		render(<CustomFieldsList allowsExtraKeys entries={entries({})} />);

		expect(screen.getByText('Not recorded')).toBeTruthy();
	});

	it('never carries the badge, whatever the surface says', () => {
		render(<CustomFieldsList allowsExtraKeys entries={entries({ waterDepth: '4' })} />);

		expect(screen.getByText('4')).toBeTruthy();
		expect(screen.queryByText('Retired')).toBeNull();
	});
});
