import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';
import { toast } from 'sonner';
import { useServiceRequestMutations } from '../../../hooks/mutations/use-service-request-mutations';
import type { ServiceRequestRecord } from '../../../hooks/queries/use-service-request-record';
import type { AskAcknowledged } from '../../../hooks/use-acknowledged-write';
import { errorMessageForSave } from '../../../lib/save-error';
import { ReasonDialog } from '../../reason-dialog';
import { DetailPageHeader } from '../../record';
import {
	formatRequestDate,
	intakeTypeLabel,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../public-engagement-display';
import { RequestStatusBadge } from '../public-engagement-ui';

const RequestIcon = iconRegistry.entities.serviceRequest.icon;
const CloseIcon = iconRegistry.actions.select.icon;
const ReopenIcon = iconRegistry.actions.reset.icon;

/**
 * The bar the service request page opens with, and the dialog its one command
 * needs: `DetailPageHeader` in the `panel` frame, because this page keeps its
 * column beside a map. Close and reopen are one menu item, whichever the
 * request's state allows, and both write a comment on the request in the same
 * transaction, so the reason dialog is where the comment's text comes from.
 * Neither reason is required; an empty box falls back to the plain fact. The
 * dialog is a sibling of the header because a menu unmounts its items on the
 * click that chooses one, and a failure is a toast.
 */
export function ServiceRequestDetailHeader({
	request,
	askDelete,
}: {
	readonly request: ServiceRequestRecord;
	readonly askDelete: AskAcknowledged;
}) {
	const title = serviceRequestTitle(request);
	const open = isServiceRequestOpen(request);
	const copy = open ? CLOSE_COPY : REOPEN_COPY;
	const mutations = useServiceRequestMutations();
	const [reasonOpen, setReasonOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	const confirm = async (reason: string) => {
		setReasonOpen(false);
		setBusy(true);
		const trimmed = reason.trim();
		const text = trimmed.length === 0 ? copy.unexplained : trimmed;
		try {
			if (open) {
				await mutations.close(request.id, text);
			} else {
				await mutations.reopen(request.id, text);
			}
		} catch (thrown) {
			toast.error(errorMessageForSave(thrown, 'Unable to update the request.'));
		}
		setBusy(false);
	};

	return (
		<>
			<DetailPageHeader
				actions={[
					{
						disabled: busy,
						icon: open ? CloseIcon : ReopenIcon,
						id: 'lifecycle',
						label: copy.action,
						minimum: 'manager',
						onSelect: () => setReasonOpen(true),
					},
				]}
				edit={{
					minimum: 'manager',
					params: { id: request.id },
					to: '/public-engagement/service-requests/$id/edit',
				}}
				flags={<RequestStatusBadge open={open} />}
				frame="panel"
				icon={RequestIcon}
				recordType="serviceRequest"
				remove={{
					ask: askDelete,
					name: title,
					onDelete: (acknowledgements) => mutations.remove(request.id, acknowledgements),
					recordId: request.id,
					returnTo: '/public-engagement/service-requests',
				}}
				subtitle={`${intakeTypeLabel(request.intakeType)} · ${formatRequestDate(request.requestDate)}`}
				tags={{ recordId: request.id, recordType: 'serviceRequest' }}
				title={title}
			/>
			<ReasonDialog
				confirmLabel={copy.action}
				description={copy.description}
				onConfirm={(reason) => void confirm(reason)}
				onOpenChange={setReasonOpen}
				open={reasonOpen}
				placeholder={copy.placeholder}
				required={false}
				title={copy.title}
			/>
		</>
	);
}

/**
 * Everything that differs between the close dialog and the reopen dialog, so a
 * wording change lands in one place.
 */
interface LifecycleCopy {
	readonly action: string;
	readonly title: string;
	readonly description: string;
	readonly placeholder: string;
	/** What the comment says when nobody explained it. */
	readonly unexplained: string;
}

const CLOSE_COPY: LifecycleCopy = {
	action: 'Close Request',
	title: 'Close this request',
	description: 'What was found, and what was done about it. This goes on the request as a comment.',
	// vocabulary-ignore site: ordinary English in a field tech's voice, not the abstraction.
	placeholder: 'No standing water found on site.',
	unexplained: 'Closed',
};

const REOPEN_COPY: LifecycleCopy = {
	action: 'Reopen Request',
	title: 'Reopen this request',
	description: 'Why this request is being picked back up. This goes on the request as a comment.',
	placeholder: 'Caller reported it again.',
	unexplained: 'Reopened',
};
