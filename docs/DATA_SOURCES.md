# Foncu data-source policy

Foncu labels every financial response with its source, last refresh time, and stale status. Interactive requests read the database; they do not scrape an upstream service while a user waits.

| Domain | Primary source | Refresh model |
| --- | --- | --- |
| Fund prices, investor counts, fund size | Takasbank TEFAS | Scheduled incremental ingestion |
| Fund disclosures and monthly holdings | KAP | Monthly snapshot workflow |
| Exchange rates and macro series | TCMB EVDS | Scheduled daily ingestion |
| Licensed enrichment | Fintables or another contracted provider | Optional fallback, always labelled |

## Operational rules

- A failed upstream refresh must not delete the last valid dataset.
- Data older than 36 hours is marked stale; monthly holdings always display their report month and year.
- `/api/health` reports database reachability and fund-profile freshness without returning credentials or internal errors.
- User-facing APIs return a stable error code and `retryable` flag when data is unavailable.
- The product is informational and must not present generated observations as personalised investment advice.
