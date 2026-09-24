import { useBreadcrumbLabel } from '@simmer-mosquito/ui-web/components/app-shell';
import { useLocation, useParams } from '@tanstack/react-router';

/**
 * Where a record page that has no record points back to, and what the
 * breadcrumb calls the record meanwhile.
 *
 * Takes the label to put on the `$id` segment in place of the raw id, and
 * returns the list the record would have been reached from, or `null` when
 * the route carries no `$id`. The list is the path up to the id, which is what
 * every detail and edit route in the app sits under: `habitats/<id>/edit`
 * points back to `habitats`. See `docs/web-hooks.md`.
 */
export function useUnavailableRecordTrail(label: string): string | null {
	const id = useParams({
		strict: false,
		select: (params) => (params as { readonly id?: string }).id,
	});
	const pathname = useLocation({ select: (location) => location.pathname });

	useBreadcrumbLabel(id, label);

	if (id === undefined || id === '') {
		return null;
	}
	const index = pathname.indexOf(`/${id}`);
	return index <= 0 ? null : pathname.slice(0, index);
}
