-- Délai de rappel configurable par événement (NULL = pas de rappel)
ALTER TABLE events ADD COLUMN reminder_minutes int DEFAULT 30;
