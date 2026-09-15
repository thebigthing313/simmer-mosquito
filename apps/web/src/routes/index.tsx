import { createFileRoute } from '@tanstack/react-router';
import { PrototypeSwitcher } from '../components/prototype-switcher';
import {
	DASHBOARD_VARIANTS,
	type DashboardVariantKey,
	VariantA,
	VariantB,
	VariantC,
} from './-dashboard-prototype';

// PROTOTYPE (#981): three Dashboard variants on static data, switchable via
// `?variant=`. The UpcomingPage stub this replaced is on develop.
export const Route = createFileRoute('/')({
	component: DashboardPrototypeRoute,
	validateSearch: (search: Record<string, unknown>): { variant?: DashboardVariantKey } => {
		const match = DASHBOARD_VARIANTS.find((variant) => variant.key === search.variant);
		return match ? { variant: match.key } : {};
	},
});

function DashboardPrototypeRoute() {
	const { variant = 'A' } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<>
			{variant === 'A' ? <VariantA /> : variant === 'B' ? <VariantB /> : <VariantC />}
			<PrototypeSwitcher
				current={variant}
				onChange={(key) =>
					navigate({ search: { variant: key as DashboardVariantKey }, replace: true })
				}
				variants={DASHBOARD_VARIANTS}
			/>
		</>
	);
}
