# Security policy

Do not open a public GitHub issue for a suspected vulnerability or exposed credential. Contact the project owner privately and include only the minimum reproduction information needed. Do not include passwords, OAuth client secrets, session values, or Cloudflare API tokens.

If a credential is accidentally exposed, revoke and rotate it immediately in the service that issued it. Removing it from the latest Git commit is not sufficient because Git history may retain it.
