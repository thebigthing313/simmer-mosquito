import { MISSION_ITEM_NAME_MAX_LENGTH } from '@simmer-mosquito/domain';
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
import { useState } from 'react';
import { type MissionStopView, missionStopName, stopNameInput } from '../operations-data';

/**
 * What one stop is called, changed in place.
 *
 * Mounted only while a stop is picked, so the box opens holding that stop's
 * stored name rather than a draft left over from the last one. An empty box
 * clears the name, which is what the command's nullable `name` is for: the stop
 * goes back to being named by the request it came from or the address it sits
 * at, and {@link missionStopName} is what says which.
 */
export function RenameStopDialog({
	stop,
	onClose,
	onRename,
}: {
	readonly stop: MissionStopView;
	readonly onClose: () => void;
	readonly onRename: (name: string | null) => void;
}) {
	const [draft, setDraft] = useState(stop.name ?? '');
	// The name this stop would carry with nothing typed, which is what clearing
	// the box leaves behind. Reading `missionStopName(stop)` here would show the
	// stored name back as the placeholder, which is the one thing it is not.
	const derived = missionStopName({ ...stop, name: null });

	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename Stop</DialogTitle>
					<DialogDescription>
						The name shows on the stop list ahead of the request or the address. Clear the box and
						the stop goes back to the name shown in it.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-1.5">
					<Label htmlFor="rename-mission-stop">Name</Label>
					<Input
						id="rename-mission-stop"
						maxLength={MISSION_ITEM_NAME_MAX_LENGTH}
						onChange={(event) => setDraft(event.target.value)}
						placeholder={derived}
						value={draft}
					/>
				</div>
				<DialogFooter>
					<Button onClick={onClose} type="button" variant="ghost">
						Cancel
					</Button>
					<Button onClick={() => onRename(stopNameInput(draft))} type="button">
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
