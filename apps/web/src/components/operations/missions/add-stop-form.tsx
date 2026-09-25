import { MISSION_ITEM_NAME_MAX_LENGTH } from '@simmer-mosquito/domain';
import { RecordFormPage } from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useDrawLocation } from '../../../hooks/map/use-draw-location';
import { useMissionItemMutations } from '../../../hooks/mutations/use-mission-item-mutations';
import { useMissionStopViews } from '../../../hooks/operations/use-mission-stop-views';
import { missionDisplayName } from '../../../hooks/queries/operations-view';
import type { MissionRecord } from '../../../hooks/queries/use-mission';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { errorMessageForSave } from '../../../lib/save-error';
import { LocationAddressField, LocationBand } from '../../forms/location-band';
import { MapCanvas } from '../../map';
import { DrawToolbar } from '../../map/geometry-control';
import { stopNameInput } from '../operations-data';
import { addStopDescription } from '../operations-display';

/**
 * The form for one stop. `canSubmit` is the route's, read off
 * `useMissionItemMutations().canWrite`. A refused save stays on the page, in
 * the `Alert` above the location band, because a form is something the person
 * can fix and resubmit; so this holds its own busy flag and message instead of
 * calling `useCommandRunner`, which reports through the toast.
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
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const stopWrites = useMissionItemMutations();
	const timeZone = useOrganizationTimeZone();

	const [name, setName] = useState('');
	const [addressId, setAddressId] = useState<string | null>(null);
	const location = useDrawLocation({
		geometryKind: 'missionItem',
		missingMessage: 'Draw where the crew has to go.',
	});

	const submit = async () => {
		if (!location.requireGeometry() || location.geometry === null) {
			return;
		}
		if (!canSubmit) {
			return;
		}
		const geometry = location.geometry;
		// Read out here rather than at the call below, which is inside the try. The
		// React Compiler reports "Support value blocks (conditional, logical,
		// optional chaining, etc) within a try/catch statement" as a `Todo` for a
		// conditional in that position, measured on this file, and a `Todo` bails
		// the whole component out of compilation (`check:compiler-bailouts`).
		const stopName = stopNameInput(name);
		setBusy(true);
		setError(null);
		try {
			await stopWrites.addAtGeometry({
				missionId: mission.id,
				geometry,
				name: stopName,
				addressId,
				position: stops.reduce((max, stop) => Math.max(max, stop.position), -1) + 1,
			});
			await navigate({ to: '/operations/missions/$id', params: { id: mission.id } });
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to add that stop.'));
		}
		setBusy(false);
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
			onSubmit={() => void submit()}
		>
			{error === null ? null : (
				<Alert variant="destructive">
					<AlertTitle>Unable to Add Stop</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<div className="grid gap-1.5">
				<Label htmlFor="mission-stop-name">Name</Label>
				<Input
					id="mission-stop-name"
					maxLength={MISSION_ITEM_NAME_MAX_LENGTH}
					onChange={(event) => setName(event.target.value)}
					placeholder="What the crew will call this stop"
					value={name}
				/>
				<p className="m-0 text-muted-foreground text-sm">
					Optional. Leave it empty and the stop is named by whatever it links to.
				</p>
			</div>

			<LocationBand
				geometryKind="missionItem"
				location={location}
				organizationId={mission.organizationId}
			>
				<LocationAddressField location={location} onChange={setAddressId} value={addressId} />
			</LocationBand>

			<p className="m-0 text-muted-foreground text-sm">
				The stop goes on the end of the mission. Reorder it from the mission page.
			</p>
		</RecordFormPage>
	);
}
