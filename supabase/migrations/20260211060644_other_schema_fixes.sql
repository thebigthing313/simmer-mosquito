alter table "public"."ulv_missions" drop constraint "valid_time_range";

alter table "public"."applications" drop constraint "amount_applied_positive";

alter table "public"."comments" drop constraint "comments_group_id_fkey";

alter table "public"."applications" alter column "amount_applied" set data type double precision using "amount_applied"::double precision;

alter table "public"."applications" alter column "applicator_id" set not null;

alter table "public"."comments" alter column "group_id" set not null;

alter table "public"."comments" alter column "is_pinned" set not null;

alter table "public"."samples" alter column "inspection_id" set not null;

alter table "public"."applications" add constraint "amount_applied_positive" CHECK ((amount_applied > (0)::double precision)) not valid;

alter table "public"."applications" validate constraint "amount_applied_positive";

alter table "public"."comments" add constraint "comments_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.groups(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."comments" validate constraint "comments_group_id_fkey";


