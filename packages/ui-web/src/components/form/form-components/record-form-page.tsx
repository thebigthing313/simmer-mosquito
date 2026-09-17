import { SplitPage } from '@simmer-mosquito/ui-web/components/app-shell/outlet/split-page';
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
 */

/**
 * Structurally compatible with each form's own `*FormHeader`, whose `backTo` is
 * narrowed to that domain's routes. Typing it as `LinkProps['to']` here keeps
 * those narrow types assignable without this module knowing every route.
 */
export interface RecordFormHeader {
	readonly title: string;
	readonly description: string;
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
	readonly children: ReactNode;
}) {
	const split = aside !== undefined;
	const column = (
		<form
			className={cn('flex flex-col', split ? 'h-full min-h-0' : 'min-h-full')}
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<header className={stickyHeader({ gap: 'tight', padding: 'roomy' })}>
				<Link
					{...backLinkProps(header)}
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
				>
					<ArrowLeftIcon aria-hidden="true" />
					{header.backLabel}
				</Link>
				<div className="grid gap-1">
					<h1 className="m-0 font-semibold text-foreground text-xl leading-tight">
						{header.title}
					</h1>
					<p className="m-0 text-muted-foreground text-sm">{header.description}</p>
				</div>
			</header>

			<div className={split ? 'min-h-0 flex-1 overflow-y-auto px-5 py-5' : 'flex-1 px-5 py-5'}>
				<div className={cn('grid', gap === 'tight' ? 'gap-5' : 'gap-6')}>{children}</div>
			</div>

			<footer className={stickyFooter({ padding: 'roomy' })}>{actions}</footer>
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
