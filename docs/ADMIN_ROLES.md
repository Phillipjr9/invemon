# Finance administration roles

Roles are enforced on the server against session user IDs, not client-supplied role values.

| Capability | Admin | Super Admin |
|---|---|---|
| Customer/account lookup, withdrawal history and reviews | Yes | Yes |
| Order queue and inventory inspection through API | Yes | Yes |
| Bank draft inspection through API | Yes | Yes |
| Bank instruction changes | No | Yes |
| Inventory registration, evidence and trading-pair configuration | No | Yes |
| Arbitrary balance editing or automatic payout dispatch | No | No |
| In-app role assignment / self-promotion | No | No |

`FUNDING_ADMIN_IDS` contains comma-separated account UUIDs for ordinary admins. `SUPER_ADMIN_IDS` contains comma-separated UUIDs for super admins. Super admins inherit admin permissions and need not be in both lists. All roles require verified email, configured MFA and an MFA-verified session; sensitive operations retain password confirmation and existing audit/revision protections. Support permissions remain independent.

Existing FUNDING_ADMIN_IDS entries become ordinary admins; no one is automatically promoted. Configure SUPER_ADMIN_IDS through authorized deployment administration before expecting bank/inventory writes to work. Do not use emails, client metadata or signup fields for assignment. No production role assignments or settings were changed by this patch. Environment changes require the platform's normal deployment rollout. These are deployment-controlled roles, not a database-backed staff-management UI.

The admin page displays the effective server role and only shows bank/inventory configuration controls to super admins. Bank drafts remain unpublished and do not enable deposits.
