import { createFileRoute } from '@tanstack/react-router';
import { UpcomingPage } from '../components/app-shell/upcoming-page';
import { periodSearchCodec } from '../components/overview/overview-data';
import { searchValidator } from '../lib/search-filters';

// The codec is in place ahead of the page (#1217), so Today's upward line
// writes `?month=` against a route that reads it.
export const Route = createFileRoute('/monthly')({
	component: UpcomingPage,
	validateSearch: searchValidator({ month: periodSearchCodec('month') }),
});
