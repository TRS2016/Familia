# notify-household

Edge Function qui envoie une notification Web Push à tous les membres du foyer (sauf l'expéditeur).

**Status : Phase 3.1 — Dry-run uniquement.** La fonction découvre les destinataires et leurs subscriptions mais n'envoie pas encore de push réel. La réponse décrit ce qui *aurait été* envoyé.

---

## Endpoint

```
POST /functions/v1/notify-household
Authorization: Bearer <user-jwt>
Content-Type: application/json
```

## Body

| Champ    | Type   | Requis | Description                                      |
|----------|--------|--------|--------------------------------------------------|
| `title`  | string | ✓      | Titre de la notification                         |
| `body`   | string | ✓      | Corps de la notification                         |
| `module` | string | –      | Module source (ex: `"groceries"`, `"calendar"`)  |
| `data`   | object | –      | Payload arbitraire transmis au service worker    |

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

### 200 OK — Dry-run

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
      "payload": {
        "title": "Liste de courses mise à jour",
        "body": "Reddy a ajouté 3 articles",
        "module": "groceries"
      }
    }
  ]
}
```

### 400 Bad Request

```json
{ "error": "\"title\" is required and must be a non-empty string" }
```

### 401 Unauthorized

```json
{ "error": "Missing or malformed Authorization header" }
```

### 403 Forbidden

```json
{ "error": "Member not found" }
```

### 405 Method Not Allowed

```json
{ "error": "Method not allowed" }
```

### 500 Internal Server Error

```json
{ "error": "Failed to fetch recipients" }
```

---

## Comportement

- Seuls les membres avec `notifications_enabled = true` sont inclus dans les destinataires.
- L'expéditeur est toujours exclu, même s'il a des subscriptions actives.
- Un membre peut avoir plusieurs subscriptions (plusieurs appareils) — toutes apparaissent dans `would_have_sent`.

## Extension future (Phase 4)

La liste des destinataires est construite dans `getRecipients(senderId, householdId)`. Pour ajouter un champ `targets?: string[]` permettant de cibler un sous-ensemble de membres, il suffira de modifier cette seule fonction sans toucher au reste du handler.
