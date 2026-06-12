-- Realtime : tables écoutées par le client mais absentes de la publication.
-- Piège découvert en debug du mode Soirée : si un canal supabase-js écoute
-- plusieurs tables et qu'UNE seule manque à la publication, le canal entier
-- est muet (statut SUBSCRIBED, aucune erreur, aucun événement — même pour les
-- tables publiées). Le canal 'lecteur-changes' (media_files/lecteur_queue/
-- playlists/playlist_items) et le canal 'moments' (moments/moment_reactions/
-- moment_comments) étaient donc tous deux morts.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.media_files,
  public.playlists,
  public.playlist_items,
  public.moment_reactions,
  public.moment_comments;
