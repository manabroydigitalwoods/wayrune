# Digital Presence — canonical product & architecture

> A multi-tenant, HTML-first website CMS and hosting platform embedded inside Travel OS, using ERP data as live content sources and converting public visitor activity into CRM inquiries.

This document is the **source of truth** for product boundaries, architectural invariants, and terminology. Prefer it over ad-hoc plans when making Presence decisions.

Related docs:

- [Content Engine](./presence-content-engine.md)
- [Theme packages](./presence-theme-packages.md)
- [Custom domains](./digital-presence-custom-domains.md)
- [Author SDK](../packages/presence-sdk/README.md)

---

## Final architectural definition

### Boundary

```text
Travel OS ERP
  ├── owns organizations, CRM, trips, quotations and integrations
  ├── provides the authoring workspace
  └── supplies data to Digital Presence

Digital Presence
  ├── owns public websites, pages, themes and components
  ├── resolves dynamic content through the Content Engine
  ├── publishes standalone HTML documents
  └── sends forms and engagement events back to Travel OS
```

That separation prevents three products from becoming mixed together:

```text
Digital Presence       = public marketing website
Living Proposal        = token-based trip/quotation sharing
Customer Portal        = authenticated customer workspace
```

### Closed-loop differentiator

The strongest product capability is not the page builder alone. It is this native loop:

```text
ERP trip or quotation
        ↓
Public website module
        ↓
Visitor interaction
        ↓
Form / WhatsApp / widget
        ↓
Lead or inquiry
        ↓
CRM and sales workflow
```

Generic CMS products approximate this with integrations. Travel OS owns the entire flow natively.

---

## What is structurally complete

```text
Identity and hosting
Theme and design system
Pages and sections
Global chrome
Reusable modules
Forms
Collections
Assets
Dynamic ERP data
Variables
Scheduling
Personalization
A/B testing
Search
Analytics
Publishing history
Runtime rendering
Author SDK
```

There is no obvious missing foundational abstraction.

---

## Architectural invariants

These must remain documented and protected by tests.

### 1. Public runtime stays independent

The public website must continue to render as a standalone HTML document.

```text
No ERP React shell
No ERP CSS
No ERP authenticated routing
No runtime npm compilation
```

### 2. Content Engine remains the single runtime path

All dynamic section behaviour should pass through the shared engine:

```text
visibility and schedule
→ visitor rules
→ A/B assignment
→ variables
→ source query
→ interpolation
→ renderer
→ analytics
```

Avoid introducing direct database access inside individual renderers.

### 3. The ERP remains the system of record

Presence may display trips and quotations, but it must not create a parallel travel inventory model.

```text
Trips source      → Travel OS Trips
Quotations source → Travel OS Quotations
CRM form output   → Travel OS Leads/Inquiries
Files             → existing Files system
```

### 4. Public projections must be explicit

Data sources should expose allowlisted public views rather than raw ERP records, especially for quotations.

Example shape:

```ts
type PublicQuotationItem = {
  id: string;
  title: string;
  destination?: string;
  duration?: string;
  publicPrice?: number;
  currency?: string;
  imageUrl?: string;
};
```

Internal margins, staff notes, customer details, and private documents must never enter the Content Engine result.

### 5. Published state is immutable

A published version should reproduce the same website even after draft content changes.

The snapshot should capture or reference stable versions of:

```text
pages
sections
global sections
theme
menus
settings
collection content policy
module definitions
design tokens
```

Live ERP data can remain dynamic, but the rendering configuration must remain version-stable.

---

## Terminology

Use these terms consistently:

| Term | Meaning |
|------|---------|
| **Site** | One hosted public website |
| **Page** | A routable document within a site |
| **Module definition** | A reusable component type |
| **Section** | A placed module instance |
| **Collection** | Structured CMS-managed content |
| **Data source** | Live or CMS content queried by a section |
| **Global section** | Site-wide chrome or reusable region |
| **Publish version** | Immutable site publication snapshot |

UI vs API naming:

```text
UI: Component
API/DB: PresenceModuleDefinition
Placed instance: PresenceSection
```

Avoid switching between “component” and “module” inside backend contracts unless one is intentionally the user-facing label and the other is the technical model.

---

## Current status

```text
Core architecture       Complete
CMS capability          Complete
Travel integration      Initial production-capable foundation
Public runtime          Complete
Author extensibility    Complete
Production hardening    Ongoing
Domain automation       Deferred
Marketplace             Deferred
Customer portal         Out of scope
```

---

## Next phase (not another feature category)

Focus on **production readiness and product depth**:

```text
Security and tenant-isolation tests
Content Engine tracing
Source field allowlisting
Cache and invalidation rules
Analytics retention and aggregation
Publish compatibility tests
Package validation and sandbox limits
Domain operational workflow
Builder usability and empty states
Real agency starter kits
```

Freeze the architecture unless a real customer workflow proves a foundational concept is missing.

---

## Canonical bottom line

> Digital Presence is the public acquisition and marketing layer of Travel OS. Staff author sites inside the ERP, but published websites run as isolated HTML documents on platform or custom domains. They consume controlled data from Travel OS through the Content Engine and return visitor inquiries and engagement signals to the CRM.
