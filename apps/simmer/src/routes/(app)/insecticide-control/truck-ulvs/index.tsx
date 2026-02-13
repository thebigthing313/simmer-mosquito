import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/insecticide-control/truck-ulvs/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/insecticide-control/truck-ulvs/"!</div>
}
