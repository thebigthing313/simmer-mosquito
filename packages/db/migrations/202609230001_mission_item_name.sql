-- migrate:up

-- A Mission stop can carry a name somebody typed.
--
-- `#1191` is the whole feature. A stop has always been named by what it links
-- to, the Requested Control Action's display name or the Address label, and a
-- stop drawn on the map with neither reads `Mapped stop` and is told apart from
-- the next one by its ordinal alone.
--
-- Nullable `text`, matching `regions.name` and the other named records. Null is
-- the absence, and the domain builders store empty and whitespace-only input as
-- null so absence has one spelling. No length check: `missions.mission_name` has
-- none either, and the 200-character cap the builder applies is the domain's.
--
-- Nothing writes it yet. The server ticket is what adds the commands.

alter table mission_items
  add column name text;

-- migrate:down

alter table mission_items
  drop column name;
