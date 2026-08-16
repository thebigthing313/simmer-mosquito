import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import {
	ASSIGNMENT_STATUS_LABELS,
	type AssignmentStatus,
} from '../../../hooks/queries/assignment-view';
import type { AssignmentTarget, ItemProgress, TargetType } from './-assignment-data';

const TrapIcon = iconRegistry.entities.trap.icon;
const HabitatIcon = iconRegistry.domains.larvalSurveillance.icon;
const ServiceRequestIcon = iconRegistry.entities.serviceRequest.icon;

const targetLabels: Readonly<Record<TargetType, string>> = {
	trap: 'Trap',
	habitat: 'Habitat',
	serviceRequest: 'Service Request',
};

const targetIcons = {
	trap: TrapIcon,
	habitat: HabitatIcon,
	serviceRequest: ServiceRequestIcon,
} as const;

const statusTones = {
	notStarted: 'neutral',
	inProgress: 'info',
	completed: 'success',
	cancelled: 'danger',
} as const;

export function AssignmentStatusBadge({ status }: { readonly status: AssignmentStatus }) {
	return (
		<Badge className="shrink-0" tone={statusTones[status]} variant="outline">
			{ASSIGNMENT_STATUS_LABELS[status]}
		</Badge>
	);
}

/**
 * A stop's progress. Pending is deliberately unbadged — most stops on an open
 * worklist are pending, and a badge on every row would say nothing while burying
 * the two states that do.
 */
export function ItemProgressBadge({ progress }: { readonly progress: ItemProgress }) {
	if (progress === 'pending') {
		return null;
	}
	return (
		<Badge
			className="shrink-0"
			tone={progress === 'completed' ? 'success' : 'warning'}
			variant="outline"
		>
			{progress === 'completed' ? 'Done' : 'Skipped'}
		</Badge>
	);
}

/** What kind of record a stop points at — assignments mix all three. */
export function TargetTypePill({ type }: { readonly type: TargetType | null }) {
	if (type === null) {
		return (
			<Badge className="shrink-0" tone="neutral" variant="outline">
				Unknown
			</Badge>
		);
	}
	const Icon = targetIcons[type];
	return (
		<Badge className="shrink-0" tone="catalog" variant="outline">
			<Icon aria-hidden="true" />
			{targetLabels[type]}
		</Badge>
	);
}

/**
 * A stop's target, linked to its own record.
 *
 * An assignment stores only a type and an id, so a target that has been deleted
 * simply stops resolving. That reads as a gap in the worklist unless it is named,
 * hence the explicit unavailable state — the stop still happened and still holds
 * its place in the sequence.
 */
export function TargetLink({
	target,
	isResolving,
}: {
	readonly target: AssignmentTarget | null;
	readonly isResolving: boolean;
}) {
	if (target === null) {
		return (
			<span className="text-muted-foreground text-sm">
				{isResolving ? 'Loading…' : 'Target unavailable'}
			</span>
		);
	}

	const label = target.isActive ? target.name : `${target.name} (retired)`;

	if (target.type === 'trap') {
		return (
			<Link
				className="font-medium text-foreground text-sm hover:underline"
				params={{ id: target.id }}
				to="/adult-surveillance/traps/$id"
			>
				{label}
			</Link>
		);
	}
	if (target.type === 'habitat') {
		return (
			<Link
				className="font-medium text-foreground text-sm hover:underline"
				params={{ id: target.id }}
				to="/larval-surveillance/habitats/$id"
			>
				{label}
			</Link>
		);
	}
	return (
		<Link
			className="font-medium text-foreground text-sm hover:underline"
			params={{ id: target.id }}
			to="/public-engagement/service-requests/$id"
		>
			{label}
		</Link>
	);
}
