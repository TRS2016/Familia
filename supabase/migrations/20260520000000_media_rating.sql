alter table media_items
  add column if not exists rating smallint
    check (rating >= 1 and rating <= 5);
