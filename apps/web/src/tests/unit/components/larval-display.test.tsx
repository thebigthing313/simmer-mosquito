// @vitest-environment jsdom

/**
 * The life-stage strip names every cell, present or absent. The six flags are
 * one complete observation, so a dimmed cell is a stage that was looked for and
 * not found, and it says so rather than going unannounced.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LifeStageStrip } from '../../../components/larval-display';

afterEach(() => {
	cleanup();
});

describe('LifeStageStrip', () => {
	it('names all six stages, present and absent alike', () => {
		render(
			<LifeStageStrip
				stages={{
					hasEggs: false,
					hasFirstInstar: true,
					hasSecondInstar: false,
					hasThirdInstar: true,
					hasFourthInstar: false,
					hasPupae: false,
				}}
			/>,
		);

		const group = within(screen.getByRole('group', { name: 'Life Stages' }));
		expect(group.getAllByRole('img').map((cell) => cell.getAttribute('aria-label'))).toEqual([
			'Eggs absent',
			'1st instar present',
			'2nd instar absent',
			'3rd instar present',
			'4th instar absent',
			'Pupae absent',
		]);
	});
});
