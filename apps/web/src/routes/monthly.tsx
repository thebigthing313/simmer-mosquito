import { createFileRoute } from '@tanstack/react-router';
import { periodSearchCodec } from '../components/overview/overview-data';
import { OverviewPage } from '../components/overview/overview-page';
import { searchValidator } from '../lib/search-filters';

export const Route = createFileRoute('/monthly')({
	component: MonthlyRoute,
	validateSearch: searchValidator({ month: periodSearchCodec('month') }),
});

function MonthlyRoute() {
	return <OverviewPage grain="month" />;
}
