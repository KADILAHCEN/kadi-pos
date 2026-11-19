# Security Specification & Threat Model for Kadi POS Firestore Sync

## 1. Data Invariants
- `/kadi_pos/store` is the sole operational store sync document; arbitrary doc IDs in `/kadi_pos/{docId}` are rejected (`docId == 'store'`).
- A store sync document MUST belong to a verified Google-authenticated `ownerUid` / `ownerEmail`, optionally authorizing bounded `allowedEmails` (max 20 entries).
- Client writes MUST match exact allowed keys (`hasAll` + `hasOnly`), enforce bounded list sizes (`products <= 2500`, `sales <= 600`, `allowedEmails <= 20`, `devices <= 50`), enforce `serverSyncedAt == request.time`, and keep `ownerUid`/`ownerEmail` immutable after creation.
- Unauthenticated users cannot read or write `/kadi_pos/store`.

## 2. Dirty Dozen Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read or write on `/kadi_pos/store`.
2. Unverified email account (`email_verified == false`) attempting create/update/read.
3. Non-owner UID not in `allowedEmails` attempting to read or update `/kadi_pos/store`.
4. Spoofing `ownerUid` to another user's UID on create.
5. Modifying `ownerUid` or `ownerEmail` on update.
6. Shadow / ghost field injection (`{ ..., isAdmin: true }`) on create or update.
7. Non-`store` document ID injection (`/kadi_pos/evil_doc` or 1.5KB ID string).
8. Oversized string in `updatedBy` (`> 160` chars).
9. Wrong data type for `products`, `sales`, `cash`, or `lastUpdated` (e.g., string instead of list/number).
10. Client-forged `serverSyncedAt` not equal to `request.time`.
11. Non-owner in `allowedEmails` attempting to modify `allowedEmails` to add external attackers.
12. Exceeding `allowedEmails` cap (`> 20` emails) or non-string element at `allowedEmails[0]`.
