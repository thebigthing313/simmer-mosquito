import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/insecticide-control/flights/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/larval-surveillance/fllights/"!</div>
}
