import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/insecticide-control/hand-ulvs/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/insecticide-control/hand-ulvs/"!</div>
}
