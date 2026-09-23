import { useEffect } from 'react';
import {
	DAILY_WORK_FILTER_CODECS,
	type DailyWorkFilters,
	dailyWorkDay,
} from '../../components/daily-work/daily-work';
import { useSearchFilters } from '../use-search-filters';

/**
 * The day the Daily Work page shows, held in the URL. A missing, stale or
 * future day reads as today and is written back to the address; clearing the
 * picker lands on today.
 */
export function useDailyWorkDay(today: string): {
	readonly day: string;
	readonly setDay: (next: string) => void;
} {
	const defaults: DailyWorkFilters = { date: today };
	// No filter counting: the page has no filter card to report a count to, since
	// the day is what the page is rather than a way of narrowing it.
	const { filters, setFilters } = useSearchFilters(defaults, DAILY_WORK_FILTER_CODECS);
	const day = dailyWorkDay(filters.date, today);

	// A stale or hand-typed future day is drawn as today, so the address has to
	// say today as well. Left alone, the link is one that names a day it does not
	// show, and it stays wrong every time it is opened or copied.
	useEffect(() => {
		if (filters.date !== day) {
			setFilters({ date: day });
		}
	}, [filters.date, day, setFilters]);

	return {
		day,
		setDay: (next: string) => setFilters({ date: next === '' ? today : next }),
	};
}
