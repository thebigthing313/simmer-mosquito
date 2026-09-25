import { SplitPage } from '@simmer-mosquito/ui-web/components/app-shell/outlet/split-page';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { AddMissionStopForm } from '../../../components/operations/missions/add-stop-form';
import { canEditMissionPlan } from '../../../components/operations/operations-data';
import { useMissionItemMutations } from '../../../hooks/mutations/use-mission-item-mutations';
import { useMission } from '../../../hooks/queries/use-mission';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/operations/missions/$id_/add-stop')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/operations/missions/$id/add-stop')) {
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
	// Read here so the route is what hands the form its attribution, the shape
	// the create routes have; the form reads the hook again for the write.
	const { canWrite: canSubmit } = useMissionItemMutations();

	if (mission === undefined) {
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
	return <AddMissionStopForm canSubmit={canSubmit} mission={mission} />;
}

function AddStopSkeleton() {
	return (
		<SplitPage aside={<Skeleton className="h-full w-full rounded-none" />}>
			<div className="grid content-start gap-5 px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-32 w-full" />
			</div>
		</SplitPage>
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
