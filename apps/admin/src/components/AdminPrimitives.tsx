import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { MouseEventHandler, ReactNode } from 'react';

export function PageHeading({
	eyebrow,
	title,
	description,
}: {
	readonly eyebrow: string;
	readonly title: string;
	readonly description: string;
}) {
	return (
		<header className="flex items-end justify-between gap-4">
			<div>
				<p className="mb-1 text-xs leading-tight font-extrabold text-primary uppercase">
					{eyebrow}
				</p>
				<h1 className="m-0 text-2xl leading-tight font-bold text-foreground">{title}</h1>
				<p className="mt-2 max-w-[70ch] text-base leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>
		</header>
	);
}

export function StatusMessage({ children }: { readonly children: ReactNode }) {
	if (children === '') {
		return null;
	}
	return <p className="text-sm leading-snug font-semibold text-[var(--warning)]">{children}</p>;
}

export function CatalogBrowserLayout({
	children,
	sidebar,
}: {
	readonly children: ReactNode;
	readonly sidebar: ReactNode;
}) {
	return (
		<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
			{children}
			<div className="grid gap-3 lg:sticky lg:top-5">{sidebar}</div>
		</div>
	);
}

export function RecordActions({ children }: { readonly children: ReactNode }) {
	return <div className="flex items-center gap-2">{children}</div>;
}

export function RecordRow({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return (
		<article
			className={cn(
				'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2 [&_h3]:m-0 [&_h3]:truncate [&_h3]:text-sm [&_h3]:leading-tight [&_h3]:font-bold [&_p]:mt-1 [&_p]:mb-0 [&_p]:truncate [&_p]:text-sm [&_p]:leading-snug [&_p]:text-muted-foreground',
				className,
			)}
		>
			{children}
		</article>
	);
}

export function EditDialogButton({
	label = 'Edit',
	onClick,
}: {
	readonly label?: string;
	readonly onClick?: MouseEventHandler<HTMLButtonElement>;
}) {
	return (
		<Button size="sm" type="button" variant="outline" onClick={onClick}>
			{label}
		</Button>
	);
}

export function DeleteConfirmDialog({
	actionLabel = 'Delete',
	children,
	description,
	onDelete,
	title,
	triggerLabel = 'Delete',
}: {
	readonly actionLabel?: string;
	readonly children?: ReactNode;
	readonly description: string;
	readonly onDelete: () => Promise<void>;
	readonly title: string;
	readonly triggerLabel?: string;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button size="sm" type="button" variant="outline">
					{triggerLabel}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				{children}
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={() => void onDelete()}>
						{actionLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
