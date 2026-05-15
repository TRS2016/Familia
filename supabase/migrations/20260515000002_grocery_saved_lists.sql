-- Listes de courses sauvegardées (modèles réutilisables)
create table grocery_saved_lists (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references households(id) on delete cascade,
  name         text        not null,
  created_at   timestamptz not null default now()
);

alter table grocery_saved_lists enable row level security;

create policy "household_members_manage_saved_lists"
  on grocery_saved_lists for all
  using  (household_id = get_my_household_id())
  with check (household_id = get_my_household_id());

-- Articles appartenant à une liste sauvegardée
create table grocery_saved_items (
  id         uuid           primary key default gen_random_uuid(),
  list_id    uuid           not null references grocery_saved_lists(id) on delete cascade,
  name       text           not null,
  quantity   text,
  price      numeric(10, 2),
  category   text,
  store      text,
  created_at timestamptz    not null default now()
);

alter table grocery_saved_items enable row level security;

create policy "household_members_manage_saved_items"
  on grocery_saved_items for all
  using (
    list_id in (
      select id from grocery_saved_lists where household_id = get_my_household_id()
    )
  )
  with check (
    list_id in (
      select id from grocery_saved_lists where household_id = get_my_household_id()
    )
  );
