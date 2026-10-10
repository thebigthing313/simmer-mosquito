/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OptionRow } from '../../../../components/pickers/entity-picker';

/**
 * A picker result draws its secondary text on a second line only when that
 * text has something to show. Text that is blank after trimming counts as
 * absent, so a whitespace-only description draws no empty line under the
 * name (#1484).
 */

function linesOf(secondary?: string | null): readonly string[] {
	const secondaryProp = secondary === undefined ? {} : { secondary };
	render(
		<OptionRow onSelect={() => {}} primary="Habitat 12" selected={false} {...secondaryProp} />,
	);
	const button = screen.getByRole('button');
	const textColumn = button.firstElementChild;
	return Array.from(textColumn?.children ?? [], (line) => line.textContent ?? '');
}

describe('a picker result row', () => {
	afterEach(cleanup);

	it.each([
		['spaces', '   '],
		['a newline', '\n'],
	])('draws no second line when the secondary text is %s', (_label, secondary) => {
		expect(linesOf(secondary)).toEqual(['Habitat 12']);
	});

	it.each([
		['empty', ''],
		['null', null],
		['left out', undefined],
	])('draws no second line when the secondary text is %s', (_label, secondary) => {
		expect(linesOf(secondary)).toEqual(['Habitat 12']);
	});

	it('draws secondary text with visible characters on the second line', () => {
		expect(linesOf('Ditch behind the school')).toEqual(['Habitat 12', 'Ditch behind the school']);
	});
});
