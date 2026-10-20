# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every path not explicitly matched under `/report_records/{recordId}` or `/report_templates/{templateId}` is strictly denied (`allow read, write: if false;`).
2. **Ownership & Identity Integrity**: Every `ReportRecord` and `ReportTemplate` document must belong to an authenticated user (`ownerId == request.auth.uid`). Write operations require `request.auth.token.email_verified == true`.
3. **Query Enforcement (No Blanket List)**: `allow list` rules on `/report_records` and `/report_templates` must enforce `resource.data.ownerId == request.auth.uid` so clients cannot query across other users' synced records or templates.
4. **Path Variable Hardening**: Single-document operations (`get`, `create`, `update`, `delete`) validate document IDs using `isValidId(id)` (`1..128` chars matching `^[a-zA-Z0-9_\-]+$`). `list` operations do not invoke `isValidId`.
5. **Strict Key & Volumetric Boundaries**: Every write operation invokes `isValidReportRecord(incoming())` or `isValidReportTemplate(incoming())`, enforcing `hasAll` and `hasOnly` key sets, string length limits, numeric bounds, enum membership, and regex patterns matching `firebase-blueprint.json`.
6. **Temporal Integrity & Immortal Fields**: `createdAt` and `updatedAt` must equal `request.time` on creation. On update, `ownerId` and `createdAt` are immutable (`incoming().field == existing().field`), and `updatedAt == request.time`.
7. **Terminal State Locking**: A `ReportRecord` can only be updated while `existing().status == 'pending'`. Once `status` transitions to `'completed'` or `'cancelled'`, all subsequent updates are rejected.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing on Create**: `ownerId: "victim_uid_999"` when `request.auth.uid == "attacker_uid_111"`.
2. **Unverified Email Write**: Authenticated user with `email_verified: false` attempting `create` on `/report_records/rec_1`.
3. **Shadow Field Injection on Create**: Valid `ReportRecord` payload plus `"isAdmin": true`.
4. **Shadow Field Injection on Update**: Updating `ReportRecord` with `affectedKeys` containing `"hiddenNotes": "injected"`.
5. **ID Poisoning Attack**: Creating a document with a 300-character ID or invalid characters `rec/../../hack`.
6. **Terminal State Mutation**: Attempting to update `amount` or `status` on a `ReportRecord` whose `existing().status == "completed"`.
7. **Immortal Field Tampering (`ownerId`)**: Updating a `ReportRecord` to transfer `ownerId` to another user.
8. **Immortal Field Tampering (`createdAt`)**: Backdating `createdAt` during an `update` operation.
9. **Client Timestamp Forgery**: Creating or updating a document with a hardcoded past/future timestamp instead of `request.time`.
10. **Value Poisoning on Whitelisted Update Field**: Updating `amount` to `-500` or `"one million"` or `status` to `"hacked_status"`.
11. **Denial of Wallet String Overflow**: Creating a `ReportRecord` with a 10,000-character `title` (exceeding `maxLength: 160`).
12. **Unauthorized Cross-Tenant List Query**: Listing `/report_records` without filtering `where('ownerId', '==', request.auth.uid)`.
