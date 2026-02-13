import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/gis/addresses/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/gis/addresses/"!</div>
}
