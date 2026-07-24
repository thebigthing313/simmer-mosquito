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
import { HomeIcon, Loader2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { useEffect, useState } from 'react';
import { AddressIdInput } from '../../-habitat-location-fields';
import { updateHabitatAddress } from './-route-data';

interface RouteStopAddressDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly habitatId: string;
	readonly habitatName: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly currentAddressId: string | null;
	readonly currentAddressLabel: string | null;
}

// This dialog has no map to draw against, so a new address is placed by geocoding.
// The manual-point fallback in the create subform rejects with this guidance.
function requestMapPointUnavailable(): Promise<never> {
	return Promise.reject(
		new Error('Geocode the address to place it, or edit the habitat to draw a point on the map.'),
	);
}

/**
 * Link the habitat behind a route stop to an address: search the address book, create
 * a new record inline if it isn't there, then persist the link. Reuses the same
 * {@link AddressIdInput} the habitat form uses; Save PATCHes the habitat's `addressId`.
 */
export function RouteStopAddressDialog({
	open,
	onOpenChange,
	habitatId,
	habitatName,
	organizationId,
	actorProfileId,
	currentAddressId,
	currentAddressLabel,
}: RouteStopAddressDialogProps) {
	const [addressId, setAddressId] = useState<string | null>(currentAddressId);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Re-seed when the dialog (re)opens — it's reused across stops from one mount.
	useEffect(() => {
		if (open) {
			setAddressId(currentAddressId);
			setError(null);
		}
	}, [open, currentAddressId]);

	const isDirty = addressId !== currentAddressId;

	const save = async () => {
		setIsSaving(true);
		setError(null);
		try {
			await updateHabitatAddress(habitatId, addressId);
			onOpenChange(false);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to update the linked address.');
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Linked Address</DialogTitle>
					<DialogDescription>
						Link {habitatName} to an address book record, or add a new one. Changes apply to the
						habitat everywhere it appears.
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center gap-2.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
					<HomeIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
					<span className="min-w-0">
						<span className="block font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wide">
							Currently linked
						</span>
						<span className="block truncate text-foreground text-sm">
							{currentAddressLabel ?? 'No address linked'}
						</span>
					</span>
				</div>

				<AddressIdInput
					actorProfileId={actorProfileId}
					onValueChange={setAddressId}
					organizationId={organizationId}
					requestMapPoint={requestMapPointUnavailable}
					value={addressId}
				/>

				{error !== null ? (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
						Cancel
					</Button>
					<Button disabled={!isDirty || isSaving} onClick={save} type="button">
						{isSaving ? (
							<Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
						) : null}
						Save Link
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
