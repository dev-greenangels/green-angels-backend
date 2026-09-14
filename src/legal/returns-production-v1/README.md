# RETURNS production Version 1

First production Returns / Right of Withdrawal texts for the SK/EU storefront.

- Source markdown: `sk|en|hu|de|cs|uk.md`
- Generated seed: `content.ts` (`RETURNS_PRODUCTION_V1`) + `entries.json`
- Upsert: `npx tsx scripts/returns-v1-production-upsert.ts` (backup under `backups/legal/`, UPDATE v1 in place, no v2)
- After section 1, every locale must keep the empty marker heading `## ---WITHDRAWAL_FORMS---` (shop forms slot)
- Placeholders: `{returnAddress}`, `{supportEmail}`
- Internal links: `[[terms|…]]`, `[[privacy|…]]`, `[[cookies|…]]`, `[[shipping|…]]`, `[[contacts|…]]`
- Pre-launch policy: overwrite existing v1 in place; never create v2 from this package
