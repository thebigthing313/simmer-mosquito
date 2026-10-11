import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import {
	FormErrorAlert,
	type RecordFormHeader,
	RecordFormPage,
	ResetButton,
	SubmitButton,
} from '@simmer-mosquito/ui-web/components/form';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import type { DrawLocation } from '../../hooks/map/use-draw-location';
import { MapCanvas } from '../map';
import { DrawToolbar } from '../map/geometry-control';

/** The two members of a `useRecordForm` result the frame calls. */
interface FramedForm {
	readonly AppForm: ComponentType<{ readonly children?: ReactNode }>;
	readonly handleSubmit: () => Promise<void>;
}

export interface RecordFormMap {
	readonly location: DrawLocation;
	readonly geometryKind: OwnedGeometryKind;
	/** What the toolbar says while it waits for a click to place a point. */
	readonly pointPrompt?: string | undefined;
	/** What the canvas draws besides the record's own shape. */
	readonly canvas?: Pick<ComponentProps<typeof MapCanvas>, 'camera' | 'geoJson' | 'layers'>;
	/** On-map chrome drawn over the canvas, such as a legend. */
	readonly legend?: ReactNode;
}

/**
 * The page a record form draws in: the header, the error alert over the
 * fields, Reset and Save, and the map beside the fields when `map` is passed.
 * The children are the form's own fields.
 */
export function RecordFormFrame({
	form,
	header,
	canSubmit,
	errorTitle,
	gap = 'default',
	map,
	children,
}: {
	readonly form: FramedForm;
	readonly header: RecordFormHeader;
	readonly canSubmit: boolean;
	/** The alert's title, such as `Unable to Save Habitat`. */
	readonly errorTitle: string;
	/** Rhythm between field sections. `tight` for forms of mostly single rows. */
	readonly gap?: 'default' | 'tight';
	readonly map?: RecordFormMap | undefined;
	readonly children: ReactNode;
}) {
	return (
		<form.AppForm>
			<RecordFormPage
				actions={
					<>
						<ResetButton />
						<SubmitButton disabled={!canSubmit} />
					</>
				}
				aside={map === undefined ? undefined : <RecordFormAside map={map} />}
				gap={gap}
				header={header}
				measure="record"
				onSubmit={() => {
					void form.handleSubmit();
				}}
			>
				<FormErrorAlert title={errorTitle} />
				{children}
			</RecordFormPage>
		</form.AppForm>
	);
}

function RecordFormAside({ map }: { readonly map: RecordFormMap }) {
	const { location } = map;
	return (
		<>
			<MapCanvas {...map.canvas} onMapReady={location.onMapReady} />
			<DrawToolbar
				controller={location.draw}
				geometryKind={map.geometryKind}
				geometryType={location.geometryType}
				{...(map.pointPrompt === undefined ? {} : { pointPrompt: map.pointPrompt })}
			/>
			{map.legend}
		</>
	);
}
