# CookiGram → CookiList transfer contract v1

Status: receiver implementation proposal for the independent docking MVP.
The sender must use this exact contract before shipping the hand-off link.

## Transport

CookiGram opens CookiList with an explicit HTTPS URL whose **fragment** is
`#cookigram-transfer=<base64url(UTF-8 JSON)>`. Fragment data is not sent to
the Pages server or in the HTTP referrer. CookiList removes the fragment from
browser history as soon as it has read it. The user must review and confirm;
opening a link never imports automatically. No shared localStorage keys,
storage events, or undocumented CookiGram internals are part of the protocol.

Maximum decoded JSON size is 24 KiB, with at most 100 items. Names are 1–120
characters, quantities 0–80 characters, slugs 1–100 characters. The transfer
ID is a UUID; invalid or oversized payloads are rejected as a whole.

```json
{
  "type": "cookigram.shopping-transfer",
  "version": 1,
  "transferId": "uuid",
  "createdAt": "2026-10-31T12:00:00Z",
  "items": [{
    "name": "Ail", "qty": "3 gousses", "slug": "ail",
    "recipe": {"id": "ratatouille", "name": "Ratatouille",
                "url": "https://cookigram.github.io/cookigram/recettes/ratatouille/"}
  }]
}
```

`slug` and `recipe` are optional. `recipe.url`, when supplied, must be HTTPS
on `cookigram.github.io`; it is retained only as optional provenance. Receiver
never fetches or navigates to it during import. Unknown fields are ignored.

## Receiver behavior

- Present item count and names, then wait for an explicit “Ajouter à ma liste”.
- Add items; never clear or replace the current list.
- Persist the imported list as one write. If the list or completion-ledger write
  fails, leave the list unchanged and the transfer retryable.
- Update frequency ranking for newly added items in the same transaction;
  failed writes must leave frequency unchanged. Undo removes the list items but
  keeps the successful-add frequency signal, as other item removals do.
- Skip existing items matching CookiList's normalized name + quantity rule.
  Report added and skipped counts. Keep source metadata on newly added items.
- Store completed `transferId`s locally. Reopening a completed transfer is a
  no-op with a clear message. A partially repeated transfer remains safe due
  to duplicate handling.
- Provide Cancel before confirmation and Undo immediately after confirmation.
  Undo removes only items created by that transfer that still match their
  original stored record; it never removes pre-existing or subsequently edited
  items. Undo also clears the completion marker so the user may retry.
- Apply Undo's list removal and ledger update as one rollback-capable operation;
  a failed write leaves the list and marker unchanged for another attempt.
- Malformed, stale-version, oversized, or unsupported transfers fail closed;
  ordinary local list use remains available.

## Acceptance cases

1. Valid link stages a preview; no list mutation occurs before confirmation.
2. Confirm adds items and preserves recipe provenance; existing list remains.
3. Repeating the transfer id adds nothing twice.
4. Duplicate name + quantity is skipped and reported; quantity variants remain.
5. Cancel leaves list and transfer ledger unchanged.
6. Undo removes only untouched items created by that transfer and permits retry.
7. Invalid encoding, schema/version, field lengths, item count, or URL origin is
   rejected without mutation.
8. Opening CookiList without a transfer keeps the standalone offline flow.

## Sender coordination

The sender lane in CookiGram must adopt this contract and add sender-side
acceptance coverage before enabling the hand-off. This document does not
authorize changes in the CookiGram repository.
