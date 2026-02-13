import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(app)/insecticide-control/ulv-missions/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/insecticide-control/ulv-missions/"!</div>
}
