import { RecordFormPage } from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { MapCanvas } from '../../../components/map';
import { DrawToolbar } from '../../../components/map/geometry-control';
import { useDrawLocation } from '../../../components/map/use-draw-location';
import { LocationAddressField, LocationBand } from '../../../forms/location-band';
import { useMissionItemMutations } from '../../../hooks/mutations/use-mission-item-mutations';
import { missionDisplayName } from '../../../hooks/queries/operations-view';
import type { MissionRecord } from '../../../hooks/queries/use-mission';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useCommandRunner } from '../-command-runner';
import { useMissionStopViews } from '../-operations-data';
import { addStopDescription } from '../-operations-display';

/**
 * The form for one stop, beside the route the way every create route keeps its
 * form in a `-*-form.tsx`.
 *
 * `canSubmit` is the route's, read off `useMissionItemMutations().canWrite`,
 * which is `canAttributeWrite` over the snapshot. This used to write the actor
 * half of that predicate itself, `actorProfileId === null`, and drop the
 * Organization half; #888 swept that shape out of sixteen other routes (#944).
 */
export function AddMissionStopForm({
	mission,
	canSubmit,
}: {
	readonly mission: MissionRecord;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();

	// Reading the stops both warms the on-demand stream the insert confirms
	// against and gives the new stop its place at the end of the order.
	const { stops } = useMissionStopViews(mission.id);
	const { busy, error, run } = useCommandRunner();
	const stopWrites = useMissionItemMutations();
	const timeZone = useOrganizationTimeZone();

	const [addressId, setAddressId] = useState<string | null>(null);
	const location = useDrawLocation({
		geometryKind: 'missionItem',
		missingMessage: 'Draw where the crew has to go.',
	});

	const submit = () => {
		if (!location.requireGeometry() || location.geometry === null) {
			return;
		}
		if (!canSubmit) {
			return;
		}
		const geometry = location.geometry;
		void run(async () => {
			await stopWrites.addAtGeometry({
				missionId: mission.id,
				geometry,
				addressId,
				position: stops.reduce((max, stop) => Math.max(max, stop.position), -1) + 1,
			});
			await navigate({ to: '/operations/missions/$id', params: { id: mission.id } });
		}, 'Unable to add that stop.');
	};

	return (
		<RecordFormPage
			actions={
				<Button disabled={busy || !canSubmit} type="submit">
					{busy ? <Spinner /> : null}
					Save
				</Button>
			}
			aside={
				<>
					<MapCanvas geoJson={location.referenceGeometry} onMapReady={location.onMapReady} />
					<DrawToolbar
						geometryKind="missionItem"
						controller={location.draw}
						geometryType={location.geometryType}
					/>
				</>
			}
			gap="tight"
			header={{
				title: 'Add a Stop',
				description: addStopDescription(missionDisplayName(mission, timeZone)),
				backTo: '/operations/missions/$id',
				backParams: { id: mission.id },
				backLabel: 'Back to mission',
			}}
			onSubmit={submit}
		>
			{error === null ? null : (
				<Alert variant="destructive">
					<AlertTitle>Unable to Add Stop</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<LocationBand
				geometryKind="missionItem"
				description="A point for one spot, a line for a run, an area for a block. The stop stores the shape as drawn."
				location={location}
				organizationId={mission.organizationId}
			>
				<LocationAddressField
					location={location}
					onChange={setAddressId}
					organizationId={mission.organizationId}
					value={addressId}
				/>
			</LocationBand>

			<p className="m-0 text-muted-foreground text-sm">
				The stop goes on the end of the mission. Reorder it from the mission page.
			</p>
		</RecordFormPage>
	);
}
