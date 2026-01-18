drop policy "delete: group manager" on "public"."trap_types";

drop policy "insert: group manager" on "public"."trap_types";

drop policy "update: group manager" on "public"."trap_types";


  create policy "delete: group admin"
  on "public"."trap_types"
  as permissive
  for delete
  to authenticated
using (public.user_has_group_role(group_id, 2));



  create policy "insert: group admin"
  on "public"."trap_types"
  as permissive
  for insert
  to authenticated
with check (public.user_has_group_role(group_id, 2));



  create policy "update: group admin"
  on "public"."trap_types"
  as permissive
  for update
  to authenticated
using (public.user_has_group_role(group_id, 2))
with check (public.user_has_group_role(group_id, 2));



