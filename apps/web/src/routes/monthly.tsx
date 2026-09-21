import { createFileRoute } from '@tanstack/react-router';
import { PeriodReviewPrototype } from '../components/period-review-prototype/prototype-page';

// PROTOTYPE (#1201): the period-in-review page at the month grain, in place of
// the UpcomingPage stub, switchable via ?variant=A|B|C.
export const Route = createFileRoute('/monthly')({
	component: () => <PeriodReviewPrototype grain="month" />,
});
