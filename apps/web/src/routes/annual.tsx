import { createFileRoute } from '@tanstack/react-router';
import { periodSearchCodec } from '../components/overview/overview-data';
import { OverviewPage } from '../components/overview/overview-page';
import { searchValidator } from '../lib/search-filters';

export const Route = createFileRoute('/annual')({
	component: AnnualRoute,
	validateSearch: searchValidator({ year: periodSearchCodec('year') }),
});

function AnnualRoute() {
	return <OverviewPage grain="year" />;
}
