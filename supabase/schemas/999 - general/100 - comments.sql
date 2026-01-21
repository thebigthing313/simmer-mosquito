create table public.comments(
    id uuid primary key default gen_random_uuid(),
    group_id uuid references public.groups(id) on delete set null,
    object_type text not null,
    object_id uuid not null,
    comment_text text not null,
    parent_id uuid references public.comments(id) on delete set null,
    is_pinned boolean default false,
    --- originating tables
    adulticide_mission_id uuid references public.adulticide_missions(id) on delete set null,
    collection_id uuid references public.collections(id) on delete set null,
    habitat_id uuid references public.habitats(id) on delete set null,
    mission_applications_id uuid references public.mission_applications(id) on delete set null,
    service_request_id uuid references public.service_requests(id) on delete set null,
    ----------------------
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null
);

create trigger handle_created_trigger before insert on public.comments for each row
execute function simmer.set_created_by ();

create trigger handle_updated_trigger before
update on public.comments for each row when (old.* is distinct from new.*)
execute function public.set_updated_record_fields ();

create trigger soft_delete_trigger
before delete on public.comments
for each row
execute function simmer.soft_delete();


alter table public.comments enable row level security;

create policy "select: group members"
on public.comments
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: group members"
on public.comments
for insert
to authenticated
with check (public.user_is_group_member(group_id));

create policy "update: group managers or record creators"
on public.comments
for update
to authenticated
using (
    public.user_has_group_role(group_id, 3) or
    (created_by = (select auth.uid()) and public.user_is_group_member(group_id))
);

create policy "delete: group managers or record creators"
on public.comments
for delete
to authenticated
using (
    public.user_has_group_role(group_id, 3) or
    (created_by = (select auth.uid()) and public.user_is_group_member(group_id))
);