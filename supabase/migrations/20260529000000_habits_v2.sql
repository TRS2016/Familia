-- Archivage (null = active, timestamptz = archivée)
ALTER TABLE habits ADD COLUMN archived_at timestamptz;

-- Rappel quotidien (heure Paris, null = pas de rappel)
ALTER TABLE habits ADD COLUMN reminder_time time;

-- Jours spécifiques (1=lundi…7=dimanche, null = utilise frequency)
ALTER TABLE habits ADD COLUMN frequency_days smallint[];

-- Note sur une completion
ALTER TABLE habit_completions ADD COLUMN note text;

-- Dédup rappels habitudes (1 push par habitude par jour)
CREATE TABLE habit_reminders_sent (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id   uuid  NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  sent_date  date  NOT NULL DEFAULT current_date,
  UNIQUE(habit_id, sent_date)
);
