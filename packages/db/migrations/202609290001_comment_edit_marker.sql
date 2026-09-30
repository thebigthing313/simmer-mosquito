-- migrate:up

-- A comment records when its text was last corrected and by whom.
--
-- `#1251` lets a Manager, Admin or Owner correct and remove anybody's comment,
-- so the thread has to say when the words on screen are not the words that were
-- posted. `updated_at` and `updated_by_profile_id` cannot say it: pinning and
-- unpinning write both, so reading either would mark every pinned comment as
-- edited. These two are written by `fieldWork.updateComment` and nothing else.
--
-- Both nullable, and null on every existing row. Nothing that exists today tells
-- an old correction from a pin, so a backfill would guess.

alter table comments
  add column edited_at timestamptz,
  add column edited_by_profile_id uuid references profiles(id) on delete set null;

-- migrate:down

alter table comments
  drop column edited_by_profile_id,
  drop column edited_at;
