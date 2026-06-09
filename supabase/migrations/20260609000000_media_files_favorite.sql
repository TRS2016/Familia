-- Favoris du Lecteur : marque un média comme favori du foyer.
alter table public.media_files
  add column if not exists is_favorite boolean not null default false;

-- Index partiel : accélère le filtre « Favoris » (peu de lignes concernées).
create index if not exists media_files_favorite_idx
  on public.media_files (household_id)
  where is_favorite;
