alter table media_items
  add column if not exists author_director text,
  add column if not exists release_year    smallint check (release_year between 1800 and 2100),
  add column if not exists genre           text,
  add column if not exists started_at      date,
  add column if not exists finished_at     date;
