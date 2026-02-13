import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(app)/insecticide-control/applications/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/insecticide-control/applications/"!</div>
}
