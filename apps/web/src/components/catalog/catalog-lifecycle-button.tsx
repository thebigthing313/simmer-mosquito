import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';

const CheckIcon = iconRegistry.actions.check.icon;
const CloseIcon = iconRegistry.actions.close.icon;

/**
 * The reversible lifecycle flip on a catalog whose rows carry their actions
 * inline rather than behind a menu.
 *
 * Clicking blurs first: the row re-sorts into the other lifecycle group on the
 * next render, and a focused button that travels with it would scroll the
 * viewport away from where the reader was working.
 *
 * `disabledHint` replaces the tooltip while the flip is unavailable, so the
 * reason is where the pointer already is.
 */
export function CatalogLifecycleButton({
	name,
	isActive,
	onToggle,
	activateLabel = 'Reactivate',
	disabled = false,
	disabledHint,
}: {
	readonly name: string;
	readonly isActive: boolean;
	readonly onToggle: () => void;
	/** What the way back is called. "Activate" where there is nothing to return to. */
	readonly activateLabel?: 'Activate' | 'Reactivate';
	readonly disabled?: boolean;
	readonly disabledHint?: string | undefined;
}) {
	const label = isActive ? 'Deactivate' : activateLabel;
	const ToggleIcon = isActive ? CloseIcon : CheckIcon;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					disabled={disabled}
					onClick={(event) => {
						event.currentTarget.blur();
						onToggle();
					}}
					size="icon"
					type="button"
					variant="outline"
				>
					<ToggleIcon aria-hidden="true" />
					<span className="sr-only">
						{label} {name}
					</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{disabled && disabledHint !== undefined ? disabledHint : label}
			</TooltipContent>
		</Tooltip>
	);
}
