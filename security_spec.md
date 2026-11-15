# Security Specification & Hardening Audit

## 1. Data Invariants
1. Default-deny catch-all (`/{document=**}`) blocks all unmapped paths.
2. Every authenticated write requires `request.auth != null && request.auth.token.email_verified == true`.
3. Every document ID path parameter is validated with `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, max 128 chars).
4. User PII documents in `/users/{userId}` can only be read/written by the owner (`userId == request.auth.uid`) or a trusted admin (`exists(/databases/$(database)/documents/admins/$(request.auth.uid))`), never via blanket `isSignedIn()`.
5. Non-admins cannot self-assign `role: 'admin'` during `/users/{userId}` creation or update, and cannot write to `/admins/{adminId}`.
6. Every `allow update` begins with `isValid[Entity](incoming())` and uses `affectedKeys().hasOnly(...)` per action, preserving immutable `id`/`uid`/`createdAt` fields.
7. Every `createdAt` / `updatedAt` timestamp must equal `request.time`.
8. Every `exam_marks` create/update checks `exists(/databases/$(database)/documents/students/$(incoming().studentId))` to prevent orphaned marks, and enforces strict `scoreType` and numeric range bounds (`0 <= numericValue <= 1000`).
9. `allow list` never calls `get()` or `exists()` and always constrains queries by `resource.data.updatedByUid == request.auth.uid` (or `resource.data.uid == request.auth.uid` on `/users`), preventing client query delegation or O(n) read amplification.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write**: `{}` without `request.auth` on `/exam_marks/m1` -> DENIED.
2. **Unverified email write**: `request.auth.token.email_verified == false` with admin email on `/erp_meta/config` -> DENIED.
3. **Self-privilege escalation on signup**: `/users/u1` create with `role: "admin"` by non-admin -> DENIED.
4. **Shadow/ghost field injection**: `/exam_marks/m1` update adding `{ isAdminVerified: true }` -> DENIED by `hasOnly`.
5. **1MB ID poisoning**: `/students/${'a'.repeat(2000)}` -> DENIED by `isValidId()`.
6. **Invalid ID characters**: `/students/../admins/u1` or `/students/foo$bar` -> DENIED by regex `^[a-zA-Z0-9_\\-]+$`.
7. **Orphaned mark injection**: `/exam_marks/m1` create pointing to non-existent `studentId: "ghost_999"` -> DENIED by `exists(...)`.
8. **Score out-of-bounds poisoning**: `/exam_marks/m1` create/update with `numericValue: 999999` or string `"hack"` -> DENIED by type and range checks.
9. **Spoofed updatedByUid**: `/exam_marks/m1` create by `uid_A` setting `updatedByUid: "uid_B"` -> DENIED by identity check.
10. **Client-supplied timestamp spoofing**: `/exam_marks/m1` create with `updatedAt: 0` instead of `request.time` -> DENIED.
11. **PII blanket read attempt**: `uid_A` reading `/users/uid_B` -> DENIED.
12. **Unconstrained list query**: `list` on `/users` or `/exam_marks` without owner/updater filter -> DENIED.
