# 10 — Data governance and AI readiness

For each important entity/class document:

| Attribute | Meaning |
|-----------|---------|
| Canonical meaning | One sentence |
| Owner | Org / system |
| Visibility | private / transaction / portfolio / platform |
| Source | provenance |
| Freshness | live vs snapshot |
| Lifecycle | status dimension |
| Versioning / snapshot | when frozen |
| Searchability | yes/no |
| AI eligibility | whether models may read |

## DataClassification

```text
sensitivity: public | internal | confidential | restricted
sharingScope: none | fulfilment | network | platform
retentionClass: short | standard | long | legal_hold
aiUsageAllowed: boolean
```

### Examples

| Data | Classification |
|------|----------------|
| Public amenity | public, AI ok |
| Dietary preference | confidential, fulfilment share |
| Agency margin | restricted, no AI / no partner |
| Identity document | restricted, consent only |
| Internal supplier note | org-private |

Structured fields + snapshots + provenance remain mandatory for any future AI tools; unrestricted retrieval is not allowed.
