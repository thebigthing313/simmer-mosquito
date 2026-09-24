import { SplitPage } from '@simmer-mosquito/ui-web/components/app-shell/outlet/split-page';
import {
	type PageContainerVariants,
	pageContainer,
} from '@simmer-mosquito/ui-web/components/page-container';
import { stickyFooter } from '@simmer-mosquito/ui-web/components/sticky-footer';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/**
 * The frame every full-page record form uses: a back link and title above, the
 * fields in the only scrolling region, and the save/reset bar pinned at the
 * foot.
 *
 * Eleven forms had grown the same four-level nesting independently, down to the
 * same class strings — which is why the action bar could scroll out of reach on
 * all of them at once. Here the `<form>` element *is* the panel's flex column,
 * so the actions are a sibling of the scroll region rather than its last child:
 * always visible, never overlapping the fields, and still inside the form they
 * submit.
 *
 * Pass `aside` for the forms that carry geography — the layout splits and hands
 * the right half to it. Omit it and the column stands alone. The slot is named
 * for its position rather than its contents because this frame lives in
 * `ui-web` and knows nothing about maps; the organization workspace passes a
 * `MapCanvas`, and the operator console passes a geometry-file preview.
 *
 * Which box scrolls depends on the branch. A split form scrolls its field
 * region, because the `SplitPage` beside a full-height map is `h-full` and
 * never scrolls itself. A column form scrolls in the shell's `main`, which
 * reserves its scrollbar gutter so the page and the route-loading skeleton
 * share one frame (#1053): a scroller of its own inside that `main` would
 * reserve a second gutter and land the form one scrollbar narrower than the
 * skeleton. The header and footer stay `sticky`, and sticky pins to the
 * nearest scrolling ancestor, so in the column branch they pin to `main`; the
 * form is `min-h-full` there so a short form still pins its actions at the
 * foot of the stage rather than under its last field.
 *
 * A column form also draws in the measured frame every other non-map page
 * sits in. The skeleton that precedes it is `pageContainer` at the app's
 * measure, so a form padded `px-5` from the stage edge landed 12px left of
 * where the skeleton's title stood on a 1920 screen, 148px on a 2560 one
 * where the frame no longer fills the stage, and the swap was a visible jump
 * (#1058). The shape is the record detail page's: the header and the footer
 * stay full-width bars, so their surface and rule span the stage, and what
 * each holds sits in `pageContainer` at the measure, the fields between them
 * in the same frame with the frame's own padding. The width of that frame is
 * the app's decision, so `measure` is read off `pageContainer` and the caller
 * names the variant, the shape `OutletSimpleLayout` and `ChangelogPage` take.
 * The default is `page`, the 1200px column the admin console draws in;
 * `apps/web` passes `record`, the 112rem cap its skeleton reserves. Widening
 * the frame widens nothing inside it: a form whose fields want a shorter line
 * caps them itself, the way the Contacts form does at 640px. The split branch
 * reads none of this, because `SplitPage` is a full-bleed two-column stage
 * whose column is deliberately not the skeleton's shape.
 */

/**
 * Structurally compatible with each form's own `*FormHeader`, whose `backTo` is
 * narrowed to that domain's routes. Typing it as `LinkProps['to']` here keeps
 * those narrow types assignable without this module knowing every route.
 */
export interface RecordFormHeader {
	readonly title: string;
	readonly description?: string | undefined;
	readonly backTo: NonNullable<LinkProps['to']>;
	readonly backParams?: Readonly<Record<string, string>>;
	readonly backLabel: string;
}

export function RecordFormPage({
	header,
	aside,
	actions,
	onSubmit,
	gap = 'default',
	measure = 'page',
	children,
}: {
	readonly header: RecordFormHeader;
	/** The right-half companion surface. Omit for forms with no geography. */
	readonly aside?: ReactNode;
	/** The pinned bar's contents — reset, submit, and any destructive action. */
	readonly actions: ReactNode;
	/** Called on submit; the layout owns `preventDefault`. */
	readonly onSubmit: () => void;
	/** Rhythm between field sections. `tight` for forms of mostly single rows. */
	readonly gap?: 'default' | 'tight';
	/*
	 * The column branch's frame; a split form ignores it. `NonNullable` because
	 * cva reads `null` as "no variant, skip the default", which would draw the
	 * column with no cap at all, the third width the `page-container` docblock
	 * rejects.
	 */
	readonly measure?: NonNullable<PageContainerVariants['measure']>;
	readonly children: ReactNode;
}) {
	const split = aside !== undefined;
	const heading = (
		<>
			<Link
				{...backLinkProps(header)}
				className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
			>
				<ArrowLeftIcon aria-hidden="true" />
				{header.backLabel}
			</Link>
			<div className="grid gap-1">
				<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">{header.title}</h1>
				{header.description === undefined ? null : (
					<p className="m-0 text-muted-foreground text-sm">{header.description}</p>
				)}
			</div>
		</>
	);
	const fields = <div className={cn('grid', gap === 'tight' ? 'gap-5' : 'gap-6')}>{children}</div>;
	/*
	 * The frame each band's contents sit in. `header` padding on the two bars,
	 * the pinned rhythm the record detail page's bar reads, and `page` on the
	 * fields, which is the skeleton's own.
	 */
	const frame = (padding: 'header' | 'page', className?: string) =>
		cn(pageContainer({ flow: 'block', gap: 'none', measure, padding }), className);

	const column = split ? (
		<form
			className="flex flex-col h-full min-h-0"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<header className={stickyHeader({ gap: 'tight', padding: 'roomy' })}>{heading}</header>
			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{fields}</div>
			<footer className={stickyFooter({ padding: 'roomy' })}>{actions}</footer>
		</form>
	) : (
		<form
			className="flex min-h-full flex-col"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<header className={stickyHeader({ padding: 'none' })}>
				<div className={frame('header', 'grid gap-2')}>{heading}</div>
			</header>
			<div className={frame('page', 'flex-1')}>{fields}</div>
			<footer className={stickyFooter({ layout: 'stack', padding: 'none' })}>
				<div className={frame('header', 'flex flex-wrap items-center justify-end gap-2')}>
					{actions}
				</div>
			</footer>
		</form>
	);

	return split ? <SplitPage aside={aside}>{column}</SplitPage> : column;
}

/**
 * Router link props for the back link.
 *
 * `to` and `params` are a dependent pair in TanStack Router's types: passed as
 * separate JSX props with a `to` widened across every domain's routes, `params`
 * resolves to a reducer signature that a plain `{ id }` cannot satisfy. Building
 * the pair as one object and spreading it is the form the router types accept —
 * the same shape `ExplorerRow` takes for its row links. Each form's own
 * `*FormHeader` narrows `backTo` to its domain's routes, so the pair stays
 * honest at the call sites, which is where a wrong route would be written.
 */
function backLinkProps(header: RecordFormHeader): LinkProps {
	return { to: header.backTo, params: header.backParams ?? {} };
}
