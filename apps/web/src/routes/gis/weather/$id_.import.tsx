import { createFileRoute, redirect } from '@tanstack/react-router';
import { ImportWeatherPage } from '../../../components/gis/weather/import-page';
import { RecordUnavailable } from '../../../components/record';
import { canAttributeWrite } from '../../../hooks/mutations/shared';
import { useWeatherStation } from '../../../hooks/queries/use-weather-station';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/gis/weather/$id_/import')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/gis/weather/$id/import')) {
			throw redirect({ params: { id: params.id }, replace: true, to: '/gis/weather/$id' });
		}
	},
	component: ImportWeatherRoute,
});

function ImportWeatherRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = canAttributeWrite({ organization, actorProfileId });
	const { station, isReady } = useWeatherStation(id);

	if (!isReady) {
		return null;
	}
	if (station === undefined) {
		return <RecordUnavailable layout="centered" recordType="weatherStation" reason="not-found" />;
	}
	return <ImportWeatherPage canSubmit={canSubmit} station={station} />;
}
