import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';

const EditIcon = iconRegistry.actions.edit.icon;
const CloseIcon = iconRegistry.actions.close.icon;
const CheckIcon = iconRegistry.actions.check.icon;
const MoreIcon = iconRegistry.arrows.moreHorizontal.icon;

/**
 * The per-row menu on a catalog table: edit, then the reversible lifecycle flip.
 *
 * `onToggle` is omitted when the reader may rename a record but not retire it —
 * the two sit on different floors on some catalogs, and a manager who can only
 * edit sees the menu with one item in it.
 *
 * `toggleDisabled` and `toggleHint` are props, never computed here, and that is
 * the point. A catalog may only pre-empt a deactivation the server will refuse
 * when it can count the referring records locally: traps sync eagerly, so the
 * collection-methods page knows; control actions sync on demand, so the
 * control-methods page would undercount and lets the server answer instead.
 */
export function CatalogRowActions({
	name,
	isActive,
	onEdit,
	onToggle,
	toggleDisabled = false,
	toggleHint,
}: {
	/** The record's own name — the menu's accessible label reads "Actions for …". */
	readonly name: string;
	readonly isActive: boolean;
	readonly onEdit: () => void;
	/** Omit when this reader may edit but not change lifecycle. */
	readonly onToggle?: (() => void) | undefined;
	readonly toggleDisabled?: boolean | undefined;
	/** Why the toggle is unavailable. Shown under it, only while disabled. */
	readonly toggleHint?: string | undefined;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="icon" type="button" variant="ghost">
					<MoreIcon aria-hidden="true" />
					<span className="sr-only">Actions for {name}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-52">
				<DropdownMenuItem onSelect={onEdit}>
					<EditIcon aria-hidden="true" />
					Edit
				</DropdownMenuItem>
				{onToggle === undefined ? null : (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={toggleDisabled} onSelect={onToggle}>
							{isActive ? (
								<>
									<CloseIcon aria-hidden="true" />
									Deactivate
								</>
							) : (
								<>
									<CheckIcon aria-hidden="true" />
									Reactivate
								</>
							)}
						</DropdownMenuItem>
						{toggleDisabled && toggleHint !== undefined ? (
							<p className="px-2 pt-0.5 pb-1.5 text-muted-foreground text-xs leading-snug">
								{toggleHint}
							</p>
						) : null}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
