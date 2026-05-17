-- Catalogue d'articles avec prix mémorisés
create table grocery_catalog (
  id           uuid           primary key default gen_random_uuid(),
  household_id uuid           not null references households(id) on delete cascade,
  name         text           not null,
  price        numeric(10, 2),
  quantity     text,
  category     text,
  store        text,
  created_at   timestamptz    not null default now()
);

alter table grocery_catalog enable row level security;

create policy "household_members_manage_catalog"
  on grocery_catalog for all
  using  (household_id = get_my_household_id())
  with check (household_id = get_my_household_id());
