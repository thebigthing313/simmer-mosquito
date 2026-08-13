import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { RecordFormPage } from '@simmer-mosquito/ui-web/components/form';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { MapCanvas } from '../../../components/map';
import { DrawToolbar } from '../../../components/map/geometry-control';
import { AddressPicker } from '../../../components/pickers/address-picker';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { isBelowRole } from '../../../lib/write-access';
import { useCommandRunner } from '../-command-runner';
import { useDrawLocation } from '../-draw-location';
import { LocationSection } from '../-location-section';
import {
	addMissionItemAtGeometry,
	canEditMissionPlan,
	type MissionView,
	missionDisplayName,
	useMission,
	useMissionStops,
} from '../-operations-data';

export const Route = createFileRoute('/operations/missions/$id_/add-stop')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/operations/missions/$id',
			});
		}
	},
	component: AddMissionStopRoute,
});

/**
 * Put a stop on a mission that no request asked for.
 *
 * The other way in — picking an open request on the mission page — copies that
 * request's geometry, so it needs no map. This one has nothing to copy: the crew
 * is being sent somewhere the queue does not know about, so the shape is drawn
 * here. A stop may be a point, a line, or an area, exactly as a request may be:
 * one storm drain, a ditch run, a whole subdivision.
 */
function AddMissionStopRoute() {
	const { id } = Route.useParams();
	const { mission, isReady } = useMission(id);

	if (mission === null) {
		return isReady ? (
			<StopUnavailable description="This mission may have been deleted, or the link is out of date." />
		) : (
			<AddStopSkeleton />
		);
	}
	if (!canEditMissionPlan(mission.status)) {
		return (
			<StopUnavailable description="This mission is finished. Reopen it on the mission page before changing what it covers." />
		);
	}
	return <AddMissionStopForm mission={mission} />;
}

function AddMissionStopForm({ mission }: { readonly mission: MissionView }) {
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const actorProfileId = auth?.authenticated === true ? auth.localIdentity.profileId : null;

	// Reading the stops both warms the on-demand stream the insert confirms
	// against and gives the new stop its place at the end of the order.
	const { stops } = useMissionStops(mission.id);
	const { busy, error, run } = useCommandRunner();
	const timeZone = useOrganizationTimeZone();

	const [addressId, setAddressId] = useState<string | null>(null);
	const location = useDrawLocation({ missingMessage: 'Draw where the crew has to go.' });

	const submit = useCallback(() => {
		if (!location.requireGeometry() || location.geometry === null) {
			return;
		}
		if (actorProfileId === null) {
			return;
		}
		const geometry = location.geometry as unknown as GeoJsonGeometry;
		void run(async () => {
			await addMissionItemAtGeometry({
				missionItemId: crypto.randomUUID(),
				missionId: mission.id,
				organizationId: mission.organizationId,
				actorProfileId,
				geometry,
				addressId,
				position: stops.reduce((max, stop) => Math.max(max, stop.position), -1) + 1,
			});
			await navigate({ to: '/operations/missions/$id', params: { id: mission.id } });
		}, 'Unable to add that stop.');
	}, [
		location,
		actorProfileId,
		mission.id,
		mission.organizationId,
		addressId,
		stops,
		run,
		navigate,
	]);

	return (
		<RecordFormPage
			actions={
				<Button disabled={busy || actorProfileId === null} type="submit">
					{busy ? <Spinner /> : null}
					Add Stop
				</Button>
			}
			aside={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={location.referenceGeometry as unknown as GeoJSON.GeoJSON | null}
						onMapReady={location.onMapReady}
					/>
					<DrawToolbar controller={location.draw} geometryType={location.geometryType} />
				</>
			}
			gap="tight"
			header={{
				title: 'Add a Stop',
				description: `Draw where the crew has to go on ${missionDisplayName(mission, timeZone)}.`,
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

			<LocationSection
				description="A point for one site, a line for a run, an area for a block. The stop stores the shape as drawn."
				location={location}
				organizationId={mission.organizationId}
			>
				<AddressPicker
					create={{ requestMapPoint: location.requestMapPoint }}
					label="Address"
					onSelect={(address) => {
						setAddressId(address?.id ?? null);
						location.clearError();
						location.selectAddress(address);
					}}
					organizationId={mission.organizationId}
					value={addressId}
				/>
			</LocationSection>

			<p className="m-0 text-muted-foreground text-sm">
				The stop goes on the end of the mission. Reorder it from the mission page.
			</p>
		</RecordFormPage>
	);
}

function AddStopSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-32 w-full" />
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}

function StopUnavailable({ description }: { readonly description: string }) {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-8">
			<Empty className="max-w-md border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>Cannot Add a Stop</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
