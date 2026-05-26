# notify-household

Edge Function qui envoie une notification Web Push à tous les membres du foyer (sauf l'expéditeur).

---

## Endpoint

```
POST /functions/v1/notify-household
Authorization: Bearer <user-jwt>
Content-Type: application/json
```

## Body

| Champ     | Type    | Requis | Description                                          |
|-----------|---------|--------|------------------------------------------------------|
| `title`   | string  | ✓      | Titre de la notification                             |
| `body`    | string  | ✓      | Corps de la notification                             |
| `module`  | string  | –      | Module source (ex: `"groceries"`, `"calendar"`)      |
| `data`    | object  | –      | Payload arbitraire transmis au service worker        |
| `dry_run` | boolean | –      | Si `true`, simule l'envoi sans appeler les push services |

### Exemple

```json
{
  "title": "Liste de courses mise à jour",
  "body": "Reddy a ajouté 3 articles",
  "module": "groceries"
}
```

---

## Réponses

### 200 OK — Envoi réel

```json
{
  "sent": 2,
  "failed": 0,
  "removed_dead_subscriptions": 0,
  "sender_member_id": "abc123",
  "details": [
    {
      "member_id": "def456",
      "display_name": "Sezin",
      "endpoint_hash": "a1b2c3d4",
      "status": "sent"
    }
  ]
}
```

`status` par détail : `"sent"` | `"failed"` | `"removed"` (subscription morte 410/404, supprimée automatiquement).

### 200 OK — Dry-run (`dry_run: true`)

```json
{
  "dry_run": true,
  "sender_member_id": "abc123",
  "sender_display_name": "Reddy",
  "recipients_count": 1,
  "subscriptions_count": 2,
  "would_have_sent": [
    {
      "member_id": "def456",
      "display_name": "Sezin",
      "endpoint": "https://fcm.googleapis.com/...",
      "payload": { "title": "...", "body": "..." }
    }
  ]
}
```

### 400 Bad Request

```json
{ "error": "\"title\" is required and must be a non-empty string" }
```

### 401 Unauthorized — JWT manquant ou invalide

### 403 Forbidden — Membre introuvable pour cet utilisateur

### 405 Method Not Allowed — Seul POST est accepté

### 500 Internal Server Error

```json
{ "error": "Server misconfiguration: VAPID keys not set" }
```

---

## Comportement

- Seuls les membres avec `notifications_enabled = true` sont inclus.
- L'expéditeur est toujours exclu (même s'il a des subscriptions actives).
- Un membre peut avoir plusieurs subscriptions (plusieurs appareils) — toutes sont notifiées.
- Les subscriptions qui retournent **410 ou 404** sont supprimées automatiquement en batch après l'envoi.
- Les autres échecs sont loggés mais la subscription est conservée.
- `endpoint_hash` dans les détails = 8 derniers caractères de l'endpoint, pour corréler les logs sans exposer l'URL complète.

## Variables d'environnement requises

| Variable                  | Description                                  |
|---------------------------|----------------------------------------------|
| `SUPABASE_URL`            | Injecté automatiquement par Supabase          |
| `SUPABASE_SERVICE_ROLE_KEY` | Injecté automatiquement par Supabase        |
| `VAPID_PUBLIC_KEY`        | Clé publique VAPID (base64 url-safe)         |
| `VAPID_PRIVATE_KEY`       | Clé privée VAPID (base64 url-safe)           |

## Extension future (Phase 4)

La liste des destinataires est construite dans `getRecipients(senderId, householdId)`. Pour ajouter un champ `targets?: string[]` permettant de cibler un sous-ensemble de membres, il suffira de modifier cette seule fonction sans toucher au reste du handler.
