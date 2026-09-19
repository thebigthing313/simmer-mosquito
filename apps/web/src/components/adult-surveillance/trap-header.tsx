import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { CheckCircle2Icon, CircleIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { trapDisplayName } from '../../hooks/queries/trap-view';
import type { TrapListing } from '../../hooks/queries/use-active-traps';
import { WriteOnly } from '../write-only';

const TrapIcon = iconRegistry.entities.trap.icon;
const AddIcon = iconRegistry.actions.add.icon;

export function TrapHeader({ trap }: { readonly trap: TrapListing }) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid min-w-0 gap-1">
				<h2 className="m-0 truncate font-semibold text-foreground text-lg leading-tight">
					{trapDisplayName(trap)}
				</h2>
				<p className="m-0 flex items-center gap-2 text-muted-foreground text-sm">
					{trap.methodName}
					<span aria-hidden="true">·</span>
					<span className="inline-flex items-center gap-1">
						{trap.isActive ? (
							<CheckCircle2Icon aria-hidden="true" className="size-3.5 text-success" />
						) : (
							<CircleIcon aria-hidden="true" className="size-3.5" />
						)}
						{trap.isActive ? 'Active' : 'Inactive'}
					</span>
				</p>
			</div>
			<div className="flex shrink-0 flex-wrap items-center gap-2">
				<Button asChild size="sm" variant="outline">
					<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id">
						<TrapIcon aria-hidden="true" />
						Open Trap
					</Link>
				</Button>
				<WriteOnly>
					<Button asChild size="sm">
						<Link search={{ trapId: trap.id }} to="/adult-surveillance/collections/create">
							<AddIcon aria-hidden="true" />
							Record Collection
						</Link>
					</Button>
				</WriteOnly>
			</div>
		</div>
	);
}

// --- the years --------------------------------------------------------------
