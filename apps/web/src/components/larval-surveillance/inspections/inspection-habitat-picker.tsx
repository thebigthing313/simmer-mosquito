import { useHabitatLabel } from '../../../hooks/larval-surveillance/use-habitat-label';
import { LabeledControl } from './inspection-form-controls';

/**
 * The habitat an inspection is already recorded against, as a read-only line,
 * because the update command cannot move it.
 */
export function SelectedHabitat({ habitatId }: { readonly habitatId: string | null }) {
	const name = useHabitatLabel(habitatId);

	return (
		<LabeledControl label="Habitat">
			<div className="flex min-h-9 w-full items-center rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-foreground text-sm">
				{name === '' ? <span className="text-muted-foreground">Loading habitat…</span> : name}
			</div>
		</LabeledControl>
	);
}
