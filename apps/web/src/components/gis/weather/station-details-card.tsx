/**
 * The Details card on a weather station's page: its type, code, status and,
 * on a provider station, the provider's own id for it.
 *
 * Takes the station as `useWeatherStation` reads it.
 */

import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import type { WeatherStation } from '../../../hooks/queries/use-weather-station';
import { weatherSourceTypeLabel } from './weather-display';

export function StationDetailsCard({ station }: { readonly station: WeatherStation }) {
	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				<DetailList>
					<DetailRow label="Type">{weatherSourceTypeLabel(station.sourceType)}</DetailRow>
					<DetailRow label="Code">{station.sourceCode}</DetailRow>
					{station.sourceType === 'organization' ? null : (
						<DetailRow label="Provider station ID">{station.providerSourceId}</DetailRow>
					)}
					<DetailRow label="Status">{station.isActive ? 'Active' : 'Inactive'}</DetailRow>
				</DetailList>
			</CardContent>
		</Card>
	);
}
