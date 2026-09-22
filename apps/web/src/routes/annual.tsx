import { createFileRoute } from '@tanstack/react-router';
import { UpcomingPage } from '../components/app-shell/upcoming-page';
import { periodSearchCodec } from '../components/overview/overview-data';
import { searchValidator } from '../lib/search-filters';

// The codec is in place ahead of the page (#1218), so Today's upward line
// writes `?year=` against a route that reads it.
export const Route = createFileRoute('/annual')({
	component: UpcomingPage,
	validateSearch: searchValidator({ year: periodSearchCodec('year') }),
});
