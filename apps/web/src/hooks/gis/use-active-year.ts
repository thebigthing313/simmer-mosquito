import { useState } from 'react';

/**
 * Which year the weather summaries card is showing, and which years it offers.
 * The chosen year is remembered per station, and the newest year stands until
 * one is chosen.
 */
export function useActiveYear(
	stationId: string,
	years: readonly number[],
): {
	/** The newest year until the user picks one, and the picked year after that. */
	readonly activeYear: number | null;
	readonly tabYears: readonly number[];
	readonly chooseYear: (year: number) => void;
} {
	const [chosen, setChosen] = useState<{
		readonly stationId: string;
		readonly year: number;
	} | null>(null);
	const chosenYear = chosen?.stationId === stationId ? chosen.year : null;

	return {
		activeYear: chosenYear ?? years[0] ?? null,
		tabYears: tabbedYears(years, chosenYear),
		chooseYear: (year: number) => setChosen({ stationId, year }),
	};
}

/**
 * The years the tabs offer.
 *
 * The years the station has readings in, plus the one the user is looking at.
 * The second half is for the moment after a write into a year that had none: the
 * optimistic row lands in the collection immediately, but a refused or failed
 * write never does, and a tab that vanished under the user would take the empty
 * state with it.
 */
export function tabbedYears(years: readonly number[], chosen: number | null): readonly number[] {
	if (chosen === null || years.includes(chosen)) {
		return years;
	}
	return [...years, chosen].sort((left, right) => right - left);
}
