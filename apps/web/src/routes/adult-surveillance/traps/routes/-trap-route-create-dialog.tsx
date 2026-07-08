import type { RouteRow } from '@simmer-mosquito/sync';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Label } from '@simmer-mosquito/ui-web/components/ui/label';
import { Loader2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useAuthSnapshot } from '../../../../hooks/use-auth-snapshot';
import { webCollections } from '../../../../sync/webCollections';

/**
 * The name-only first step of trap-route creation. Persists a `routeType: 'trap'`
 * route, then hands straight off to the edit surface where stops are curated.
 */
export function TrapRouteCreateDialog({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const navigate = useNavigate();
	const [name, setName] = useState('');
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const organizationId = identity?.organizationId ?? null;
	const trimmed = name.trim();
	const canSubmit = organizationId !== null && trimmed.length > 0 && !pending;

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		if (organizationId === null) {
			setError('Your profile is still loading. Try again in a moment.');
			return;
		}
		if (trimmed.length === 0) {
			return;
		}
		setPending(true);
		setError(null);
		try {
			const now = new Date().toISOString();
			const row: RouteRow = {
				id: crypto.randomUUID(),
				organizationId,
				routeName: trimmed,
				routeType: 'trap',
				createdAt: now,
				updatedAt: now,
			};
			await webCollections.routes.insert(row).isPersisted.promise;
			setName('');
			onOpenChange(false);
			await navigate({
				to: '/adult-surveillance/traps/routes/$id/edit',
				params: { id: row.id },
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to create the route.');
		} finally {
			setPending(false);
		}
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) {
			setName('');
			setError(null);
		}
		onOpenChange(next);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>New trap route</DialogTitle>
						<DialogDescription>
							Name the route now; you'll add and order its trap stops next.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-2 py-4">
						<Label htmlFor="trap-route-name">Route name</Label>
						<Input
							autoFocus
							id="trap-route-name"
							onChange={(event) => setName(event.target.value)}
							placeholder="e.g. North CDC traps — Monday"
							value={name}
						/>
						{error !== null ? (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						) : null}
					</div>

					<DialogFooter>
						<Button
							disabled={pending}
							onClick={() => handleOpenChange(false)}
							type="button"
							variant="outline"
						>
							Cancel
						</Button>
						<Button disabled={!canSubmit} type="submit">
							{pending ? <Loader2Icon aria-hidden="true" className="animate-spin" /> : null}
							Create route
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
