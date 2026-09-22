import type { TagTargetType } from '@simmer-mosquito/domain';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import {
	iconRegistry,
	MoreHorizontalIcon,
	type RegistryIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { Link, type LinkProps } from '@tanstack/react-router';
import { Fragment, type ReactNode, useState } from 'react';
import { useAuthSnapshot } from '../../hooks/use-auth-snapshot';
import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { hasAtLeastRole, type MinimumRole } from '../../lib/write-access';
import {
	DELETE_FLOOR,
	type RecordDeleteDestination,
	RecordDeleteDialog,
	type RecordDeleteProps,
	type RecordDeleteTarget,
} from '../record-delete-dialog';
import { RecordTags } from './record-tags';

/**
 * The bar every record detail page opens with.
 *
 * Pinned rather than scrolled away, because a record page is long and the thing
 * a reader loses first is which record they are on: the habitat history runs
 * nine rows, the trap's collections twenty-two pages, and past the fold the
 * page was a table with no name over it.
 *
 * It is `sticky` rather than `fixed`, which is what lets it share the scroll
 * box with the content and therefore share the container the layout is
 * measured against, the `record` measure on a page and the column on a panel
 * (see {@link DetailHeaderFrame}). A fixed bar would be positioned against the viewport, so it
 * would sit over the rails and need its own copy of the measure to line its
 * title up with the first card. It follows DESIGN.md's Opaque Pin Rule: an
 * opaque surface, a one-pixel bottom border, `z-10`, and no blur, since nothing
 * shows through a surface that is already opaque.
 *
 * ## What is in it, and what is not
 *
 * Left: the record's icon and type, its name, and its supporting line. The
 * controls that act on the record sit against the name rather than at the far
 * right, because the far right of a page that now fills a 2560 screen is a
 * thousand pixels from the thing being acted on.
 *
 * Right: the record's flags and its Tags. Both are facts about the record that
 * a reader wants without scrolling, and both are the record's own state rather
 * than an action, so they read as the far end of the bar rather than as
 * controls somebody has to look past.
 *
 * Both controls carry a `Tooltip` rather than a `title` attribute. The
 * `aria-label` is what names them, and `title` was never doing that job: support
 * for it as a name source varies by browser and screen reader, and it is
 * invisible to a touch device. What it did do was draw the browser's own
 * unstyled bubble a second after the pointer stopped, next to the cursor rather
 * than next to the button. The tooltip is the product's, on the shell's 300ms
 * provider, and it points at the control.
 *
 * There is no back link. It said the same thing the breadcrumb above it says
 * and the browser's own back button does, three ways of going up, and the one
 * that cost a row of the page was the one that could be wrong: it named a fixed
 * destination, so a habitat opened from Daily Work offered "Back to habitats".
 *
 * ## A refused write from the menu is a toast
 *
 * A refusal of a write the person cannot correct in place is a toast, and an
 * in-page `Alert` is for a refusal the page can act on. The first shape is a
 * lifecycle change chosen from the `...`, a close, a reopen, a start or a
 * cancel, and the delete. The server refuses one on its preconditions, "Some
 * stops are still pending", and there is nothing on the page to change before
 * asking again. The second is a form, where the person fixes the field the
 * refusal names and resubmits, so the sentence belongs beside the fields.
 *
 * The toast is what the shape of the menu decides rather than a preference. A
 * menu item unmounts on the click that chooses it, so by the time the answer
 * arrives there is no control on the page to report against, and a line
 * reserved for it would be a slot the bar holds open for a message that is
 * nearly always absent. `RecordDeleteDialog` already reports its refusal that
 * way and for the same reason. The message is the same on both, the server's
 * sentence when the thrown error carries one and the page's own fallback when
 * it does not. `ServiceRequestDetailHeader` is the pattern for a menu command
 * written by hand, and `useCommandRunner` under `routes/operations` is the
 * same gate for the request for control page's menu and for the two worklist
 * pages, which draw their lifecycle controls as buttons rather than a menu and
 * follow the rule anyway, since a refused start on a worklist is no more
 * correctable in place than a refused close is here (#1100).
 *
 * ## The eyebrow reads the register
 *
 * `recordType` is the register's key and the eyebrow is `recordNoun(...).title`,
 * which is what puts this module on `check:record-nouns`' list of readers. It
 * used to take the eyebrow's display text under the same prop name, typed
 * `string`, and the fourteen detail pages spelled it by hand: three disagreed
 * with the register outright, `Biocontrol`, `Source reduction` and `Outreach`,
 * two put `Larval` in front of a word the register carries bare, one wrote
 * `Application` for a chemical application, and the rest agreed by copy (#1020).
 * The same key names the record the `...` menu deletes, which is why `remove`
 * no longer carries one of its own: see {@link DetailPageRecord}.
 */
export function DetailPageHeader(props: DetailPageHeaderProps) {
	const {
		icon: RecordIcon,
		recordType,
		title,
		subtitle,
		edit,
		actions,
		flags,
		tags,
		frame,
	} = props;
	return (
		<DetailHeaderBar frame={frame ?? 'page'}>
			<div className="flex min-w-0 flex-col gap-1.5">
				<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
					<RecordIcon aria-hidden="true" className="size-3.5" />
					{recordNoun(recordType).title}
				</span>
				<div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2">
					<h1 className="m-0 text-pretty font-semibold text-foreground text-heading leading-heading">
						{title}
					</h1>
					{edit === undefined ? null : <EditControl edit={edit} />}
					<ActionsMenu actions={actions ?? NO_ACTIONS} remove={deletionOf(props)} />
				</div>
				{subtitle === undefined ? null : (
					<div className="max-w-[68ch] text-pretty text-muted-foreground text-sm leading-snug">
						{subtitle}
					</div>
				)}
			</div>
			<div className="flex flex-wrap items-center justify-end gap-1.5">
				{flags}
				{tags === undefined ? null : (
					<RecordTags recordId={tags.recordId} recordType={tags.recordType} />
				)}
			</div>
		</DetailHeaderBar>
	);
}

export type DetailPageHeaderProps = DetailPageHeaderBase & DetailPageRecord;

interface DetailPageHeaderBase {
	/** The record type's mark, from `iconRegistry.entities`. */
	readonly icon: RegistryIcon;
	/** The record's name. */
	readonly title: string;
	/** The line under the name: what this record is, in a few words. */
	readonly subtitle?: ReactNode;
	/** The pencil. Omit for a record with no edit route, which is the inspection. */
	readonly edit?: DetailEditLink;
	/** Everything else the page can do, behind the `...`. */
	readonly actions?: readonly DetailAction[];
	/** The record's state badges, drawn at the right end of the bar. */
	readonly flags?: ReactNode;
	/**
	 * The record's id and type, for the six kinds `TAG_TARGET_TYPES` allows.
	 *
	 * The type is what the *write* needs: `tag_items.entity_id` is globally
	 * unique so the read gets by without one, and `assignTag` names both columns.
	 * It is also what the picker's `For habitats` heading reads off the register.
	 */
	readonly tags?: { readonly recordId: string; readonly recordType: TagTargetType };
	/** The box the bar is measured in. Defaults to `page`. See {@link DetailHeaderFrame}. */
	readonly frame?: DetailHeaderFrame;
}

/**
 * What the bar sits in, which decides its measure and padding.
 *
 * `page` is the record container: the bar spans the stage and its padding is
 * `pageContainer`'s `header`, so the title sits over the first card's edge.
 * That is every page on `DetailPageShell`, and the skeleton, which draws at
 * the page measure whatever frame the record will arrive in: the service
 * request page loads there too, since its split needs the request's
 * coordinates before it can draw the map.
 *
 * So on that page the bar draws at the page measure while the request loads
 * and at the panel measure once it lands, and that jump is accepted (#1099).
 * The alternative was a stand-in map column under the skeleton, and it is one
 * of two things. A live Mapbox instance with nothing to draw is a second GL
 * context, and one the Suspense swap then destroys, which is the `isMapLive`
 * trap over again. A grey block that swaps for the map when the request
 * arrives moves more of the screen than the bar does. A page beside a map
 * that can draw its split before its record arrives is what reopens this.
 *
 * `panel` is a column that already has a measure of its own, the 40% the
 * service request page keeps beside its map. The `record` measure would be no
 * cap there, and the `header` padding steps up to 32px a side at `md`, which in
 * a 500px column is a bar whose title and pencil wrap before the flags do. So
 * the bar takes the column's own padding, the same `p-4` the body scrolling
 * under it is padded with. One prop rather than a second header, because
 * everything else about the bar, the eyebrow, the menu, the Tags and the rule
 * they sit under, is the same bar.
 */
type DetailHeaderFrame = 'page' | 'panel';

/**
 * Which record the bar names, and whether it can be deleted from here.
 *
 * One `recordType` rather than two. The eyebrow's key and the delete dialog's
 * key were one name on one component with two types, a display string on the
 * header and a register key under `remove`, and every page wrote both. Now a
 * page writes the key once and the header hands it to the dialog.
 *
 * A union rather than one optional `remove`, because the dialog's key is
 * narrower than the eyebrow's: `RecordDeleteTarget` takes only the record types
 * with a delete policy, and a weather station has a page and no delete. So a
 * page for a record that cannot be deleted may not pass `remove`, and a page
 * that passes it has already said, in `recordType`, that the endpoint knows the
 * kind. `tsc` refuses the other pairing rather than the endpoint refusing it.
 */
type DetailPageRecord =
	| {
			/** The register's key for this record type, which names the eyebrow. */
			readonly recordType: DeletableDetailType;
			/**
			 * Deleting the record, which is the last item in the `...` and the dialog
			 * it opens. Omit for a record with no delete.
			 */
			readonly remove?: DetailPageRemove;
	  }
	| {
			readonly recordType: Exclude<RecordType, DeletableDetailType>;
			readonly remove?: undefined;
	  };

type DeletableDetailType = RecordDeleteTarget['recordType'];

/** The delete dialog's props less the key, which is the header's. */
type DetailPageRemove = Omit<RecordDeleteTarget, 'recordType'> & RecordDeleteDestination;

/** The dialog's props for this record, or nothing when it cannot be deleted from here. */
function deletionOf(props: DetailPageRecord): RecordDeleteProps | undefined {
	return props.remove === undefined ? undefined : { ...props.remove, recordType: props.recordType };
}

/** Where the pencil goes, and who may press it. */
interface DetailEditLink {
	readonly to: NonNullable<LinkProps['to']>;
	readonly params?: Readonly<Record<string, string>>;
	/** The floor for this record's edit command. Defaults to `collector`. */
	readonly minimum?: MinimumRole;
}

interface DetailActionBase {
	/** Stable across renders; the React key and nothing else. */
	readonly id: string;
	readonly label: string;
	readonly icon: RegistryIcon;
	/** The floor for the command behind it. Defaults to `collector`. */
	readonly minimum?: MinimumRole;
	/**
	 * Leave the item out entirely. For an action the record's own state rules
	 * out, such as collecting a Collection that has already been collected, or a
	 * child a record has nothing to seed: an ad-hoc inspection names no habitat,
	 * so a control action opened from one would have nothing to file against.
	 */
	readonly hidden?: boolean;
	/**
	 * Draw a rule above this item. For the break between what a record can
	 * create and what can be done to the record itself.
	 */
	readonly separatorBefore?: boolean;
}

/** An action that goes somewhere: a create form, a merge page. */
interface DetailActionLink extends DetailActionBase {
	readonly to: NonNullable<LinkProps['to']>;
	readonly params?: Readonly<Record<string, string>>;
	/**
	 * The seed a create form opens on, such as `{ habitatId }`.
	 *
	 * Typed loosely rather than against the route, the same trade `to` and
	 * `params` make: a component cannot know each domain's search schemas, so the
	 * route's own `validateSearch` is what refuses a key it does not take, and it
	 * refuses by dropping the value rather than by failing. See
	 * `lib/record-seed-search.ts`.
	 */
	readonly search?: Readonly<Record<string, string>>;
	readonly onSelect?: undefined;
}

/** An action that writes from here: resolving a request, collecting a trap. */
interface DetailActionCommand extends DetailActionBase {
	readonly onSelect: () => void;
	readonly disabled?: boolean;
	readonly to?: undefined;
}

/**
 * One entry in the `...` menu.
 *
 * A union rather than a bag of optional fields, so an action cannot be both a
 * link and a command and leave the reader of the call site guessing which one
 * the click does.
 */
export type DetailAction = DetailActionLink | DetailActionCommand;

const NO_ACTIONS: readonly DetailAction[] = [];

const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

/**
 * The bar's chrome and measure, shared with {@link DetailPageHeaderSkeleton} so
 * the pinned bar is the same height before the record arrives and the content
 * below it does not jump. The same height and not the same width: the skeleton
 * is always at `page`, and {@link DetailHeaderFrame} says what that costs on
 * the one page whose bar arrives at `panel`. The bar names its frame in
 * `data-frame`, so a suite can pin which one a page draws in without reading
 * the padding classes back.
 */
function DetailHeaderBar({
	children,
	frame,
}: {
	readonly children: ReactNode;
	readonly frame: DetailHeaderFrame;
}) {
	return (
		<header className="sticky top-0 z-10 border-border border-b bg-background" data-frame={frame}>
			<div
				className={
					frame === 'panel'
						? 'p-4'
						: pageContainer({
								flow: 'block',
								gap: 'none',
								measure: 'record',
								padding: 'header',
							})
				}
			>
				<div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">{children}</div>
			</div>
		</header>
	);
}

/** The bar before the record, in the frame's skeleton. */
export function DetailPageHeaderSkeleton() {
	return (
		<DetailHeaderBar frame="page">
			<div className="flex min-w-0 flex-col gap-1.5">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-48" />
			</div>
			<Skeleton className="h-6 w-32" />
		</DetailHeaderBar>
	);
}

function EditControl({ edit }: { readonly edit: DetailEditLink }) {
	const auth = useAuthSnapshot();
	if (!hasAtLeastRole(auth, edit.minimum ?? 'collector')) {
		return null;
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button asChild aria-label="Edit" size="icon-sm" variant="ghost">
					<Link {...{ to: edit.to, params: edit.params ?? {} }}>
						<EditIcon aria-hidden="true" />
					</Link>
				</Button>
			</TooltipTrigger>
			<TooltipContent>Edit</TooltipContent>
		</Tooltip>
	);
}

/**
 * The `...` beside the record's name.
 *
 * The role check reads the snapshot once and filters, rather than wrapping each
 * item in `WriteOnly`. Both hide the same items, but only this one can tell
 * that every item is hidden, and a `...` that opens on an empty menu is worse
 * than no `...` at all.
 *
 * Delete is always last, under a rule, and it is the only item that is not in
 * `actions`: it needs a dialog, and a dialog rendered inside a menu item is
 * unmounted by the click that opens it. So the dialog is a sibling of the menu
 * and the item only sets the flag.
 */
function ActionsMenu({
	actions,
	remove,
}: {
	readonly actions: readonly DetailAction[];
	readonly remove: RecordDeleteProps | undefined;
}) {
	const auth = useAuthSnapshot();
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const visible = actions.filter(
		(action) => action.hidden !== true && hasAtLeastRole(auth, action.minimum ?? 'collector'),
	);
	const canDelete = remove !== undefined && hasAtLeastRole(auth, DELETE_FLOOR[remove.recordType]);
	if (visible.length === 0 && !canDelete) {
		return null;
	}
	return (
		<>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button aria-label="More actions" size="icon-sm" variant="ghost">
								<MoreHorizontalIcon aria-hidden="true" />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>More actions</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="start" className="min-w-52">
					{visible.map((action, index) => (
						<Fragment key={action.id}>
							{action.separatorBefore === true && index > 0 ? <DropdownMenuSeparator /> : null}
							<ActionItem action={action} />
						</Fragment>
					))}
					{canDelete && remove !== undefined ? (
						<>
							{visible.length === 0 ? null : <DropdownMenuSeparator />}
							<DropdownMenuItem onSelect={() => setConfirmingDelete(true)} variant="destructive">
								<DeleteIcon aria-hidden="true" />
								Delete {recordNoun(remove.recordType).one}
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			{remove === undefined ? null : (
				<RecordDeleteDialog
					{...remove}
					onOpenChange={setConfirmingDelete}
					open={confirmingDelete}
				/>
			)}
		</>
	);
}

function ActionItem({ action }: { readonly action: DetailAction }) {
	const ActionIcon = action.icon;
	if (action.to === undefined) {
		return (
			<DropdownMenuItem disabled={action.disabled ?? false} onSelect={action.onSelect}>
				<ActionIcon aria-hidden="true" />
				{action.label}
			</DropdownMenuItem>
		);
	}
	return (
		<DropdownMenuItem asChild>
			<Link {...{ to: action.to, params: action.params ?? {}, search: action.search ?? {} }}>
				<ActionIcon aria-hidden="true" />
				{action.label}
			</Link>
		</DropdownMenuItem>
	);
}
