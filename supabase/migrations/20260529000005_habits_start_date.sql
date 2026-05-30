-- Date de démarrage de l'habitude (null = pas de restriction, affiche tout l'historique)
ALTER TABLE habits ADD COLUMN start_date date;
