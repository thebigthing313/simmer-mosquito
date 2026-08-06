import type { RouteRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
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
import { useAuthSnapshot } from '../../hooks/use-auth-snapshot';
import { webCollections } from '../../sync/webCollections';
import type { RoutePlanningSurface } from './surface';

/**
 * The name-only first step of route creation. Persists the route, then hands
 * straight off to the edit surface where stops are curated — so a new route
 * never lingers as an empty shell the user has to find again.
 */
export function RouteCreateDialog({
	surface,
	open,
	onOpenChange,
}: {
	readonly surface: RoutePlanningSurface;
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
				routeType: surface.routeType,
				createdAt: now,
				updatedAt: now,
			};
			await settleWrite(webCollections.routes.insert(row));
			setName('');
			onOpenChange(false);
			await navigate(surface.editLink(row.id));
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
						<DialogTitle>New Route</DialogTitle>
						<DialogDescription>
							Name the route now; you'll add and order its {surface.stopNounPlural} next.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-2 py-4">
						<Label htmlFor="route-name">Route name</Label>
						<Input
							autoFocus
							id="route-name"
							onChange={(event) => setName(event.target.value)}
							placeholder={surface.namePlaceholder}
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
							Create Route
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
