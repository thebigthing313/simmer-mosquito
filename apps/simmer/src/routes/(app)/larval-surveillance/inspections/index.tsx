import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/larval-surveillance/inspections/')(
  {
    component: RouteComponent,
  },
)

function RouteComponent() {
  return <div>Hello "/(app)/larval-surveillance/inspections/"!</div>
}
