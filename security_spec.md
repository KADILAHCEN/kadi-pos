# Security Specification & Threat Model for Kadi POS Firestore Sync

## 1. Data Invariants
- `/kadi_pos/{docId}` accepts isolated merchant workspaces (`store_<uid>`) or the legacy shared workspace (`store`); arbitrary doc IDs in `/kadi_pos/{docId}` are rejected (`isValidStoreDocId(docId)`), and creating `store_<otherUid>` is denied (`docId == 'store' || docId == ('store_' + request.auth.uid)`).
- A store sync document MUST belong to a verified Google-authenticated `ownerUid` / `ownerEmail`, optionally authorizing bounded `allowedEmails` (max 20 entries).
- Client writes MUST match exact allowed keys (`hasAll` + `hasOnly`), enforce bounded list sizes (`products <= 2500`, `sales <= 600`, `customers <= 1000`, `creditTransactions <= 1000`, `categories <= 200`, `expenses <= 400`, `supplierInvoices <= 300`, `suppliers <= 200`, `allowedEmails <= 20`, `devices <= 50`), enforce `serverSyncedAt == request.time`, and keep `ownerUid`/`ownerEmail` immutable after creation.
- Optional ledger lists (`customers`, `creditTransactions`, `categories`, `expenses`, `supplierInvoices`, `suppliers`) must have `map` elements when non-empty and are strictly bounded to prevent 1MB document bloat or abuse.
- Unauthenticated users cannot read or write `/kadi_pos/{docId}`.

## 2. Dirty Dozen Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read or write on `/kadi_pos/store` or `/kadi_pos/store_<uid>`.
2. Unverified email account (`email_verified == false`) attempting create/update/read.
3. Non-owner UID not in `allowedEmails` attempting to read or update `/kadi_pos/{docId}`.
4. Spoofing `ownerUid` or creating `store_<victimUid>` by another user.
5. Modifying `ownerUid` or `ownerEmail` on update.
6. Shadow / ghost field injection (`{ ..., isAdmin: true }`) on create or update.
7. Invalid document ID injection (`/kadi_pos/evil_doc` or 1.5KB ID string).
8. Oversized string in `updatedBy` (`> 160` chars).
9. Wrong data type for `products`, `sales`, `cash`, or `lastUpdated` (e.g., string instead of list/number).
10. Client-forged `serverSyncedAt` not equal to `request.time`.
11. Non-owner in `allowedEmails` attempting to modify `allowedEmails` to add external attackers.
12. Exceeding `allowedEmails` cap (`> 20` emails) or non-string element at `allowedEmails[0]`.

## 3. Invoice Drive Archive (`/kadi_pos_invoice_files/{fileId}`) Invariants & Threat Checks
- Every record in `/kadi_pos_invoice_files/{fileId}` MUST belong to a verified Google user (`request.auth.token.email_verified == true`) with `ownerUid == request.auth.uid` and `ownerEmail == request.auth.token.email`.
- List queries MUST be scoped by `existing().ownerUid == request.auth.uid` (no blanket `isSignedIn()` reads).
- Document IDs MUST satisfy `isValidId(fileId)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
- On `create`: required keys (`driveFileId`, `fileName`, `mimeType`, `invoiceNumber`, `vendorName`, `ownerUid`, `ownerEmail`, `createdAt`, `updatedAt`) and strict `hasOnly` allowlist are enforced; `createdAt == request.time && updatedAt == request.time`.
- On `update`: `ownerUid`, `ownerEmail`, `driveFileId`, `driveFolderId`, `fileName`, `mimeType`, `fileSize`, `webViewLink`, and `createdAt` are immutable; only metadata fields (`invoiceNumber`, `vendorName`, `vendorIce`, `invoiceDate`, `totalAmount`, `notes`, `updatedAt`) may change, with `updatedAt == request.time`.
- On `delete`: only the verified owner (`existing().ownerUid == request.auth.uid`) may delete their invoice file metadata record.
- Adversarial payloads rejected (`PERMISSION_DENIED`): unauthenticated read/write, unverified email, spoofing `ownerUid`, reading/updating/deleting another user's `fileId`, injecting ghost fields (`isAdmin: true`), oversized `vendorName` (`> 160` chars) or `notes` (`> 500` chars), mutating `driveFileId` or `createdAt` on update, or forging `createdAt`/`updatedAt` != `request.time`.

## 4. Invoice Scans (`/invoice_scans/{scanId}`) Invariants & Threat Checks
- Every document in `/invoice_scans/{scanId}` MUST belong to a verified Google-authenticated user (`request.auth.token.email_verified == true`) with `userId == request.auth.uid` and `userEmail == request.auth.token.email`.
- Document IDs MUST satisfy `isValidId(scanId)` (`^[a-zA-Z0-9_\-]+$`, 1–128 chars) on single-document operations (`get`, `create`, `update`, `delete`).
- `allow list` MUST explicitly enforce `existing().userId == request.auth.uid` with zero blanket reads or `get()` calls.
- On `create`: required fields (`driveFileId`, `fileName`, `mimeType`, `invoiceNumber`, `vendorName`, `date`, `userId`, `userEmail`, `createdAt`, `updatedAt`) and strict `hasOnly` allowlist are enforced; `createdAt == request.time && updatedAt == request.time`.
- On `update`: `userId`, `userEmail`, `driveFileId`, `driveFolderId`, `fileName`, `mimeType`, `fileSize`, `webViewLink`, and `createdAt` are immutable; only form metadata (`invoiceNumber`, `vendorName`, `date`, `vendorIce`, `totalAmount`, `notes`, `updatedAt`) may be updated, with `updatedAt == request.time`.
- On `delete`: only the verified owner (`existing().userId == request.auth.uid`) may delete their invoice scan record.
- Adversarial payloads rejected (`PERMISSION_DENIED`): unauthenticated read/write, unverified email, spoofing `userId` or `userEmail`, querying or reading another user's `scanId`, ghost field injection (`{ ..., role: 'admin' }`), oversized `date` (`> 32` chars) or `vendorName` (`> 160` chars), mutating `driveFileId` or `userId` on update, or forging timestamps != `request.time`.
