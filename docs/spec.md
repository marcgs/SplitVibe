# SplitVibe — Product Specification

**Version:** 0.1
**Date:** 2026-02-20
**Status:** Draft

---

## 1. Overview

SplitVibe is a shared-expense tracking app for friends and family — a Splitwise-style tool that lets groups record expenses, split costs in flexible ways, track who owes whom, and mark debts as settled. It targets both web and mobile users and focuses on simplicity, fairness, and multi-currency support.

---

## 2. Goals & Non-Goals

### Goals
- Let groups of people record and split shared expenses.
- Support flexible split modes: equal, percentage, and weighted shares.
- Track balances per group and across the platform.
- Automatically simplify debts to minimize the number of required payments.
- Support multi-currency expenses with currency conversion.
- Allow users to upload receipts or attachments to expenses.
- Provide a frictionless social login experience.

### Non-Goals (v1)
- Real payment processing or integration with payment providers.
- Recurring/scheduled expenses.
- In-app notifications, email alerts, or push notifications.
- Expense comments or activity log.
- Direct (non-group) expenses between two users.

---

## 3. Users & Access

| Surface | Description |
|--------|-------------|
| **Web app** | Full-featured browser-based interface, responsive for desktop and tablet. |
| **Mobile app** | Dedicated mobile experience (iOS and Android) via a responsive web app (PWA) or native wrappers. |

All surfaces share the same backend and data.

---

## 4. Authentication

- **Social login only** — no email/password registration.
- Supported providers (at minimum): **Google**, **Apple**.
- On first login, a user profile is created automatically (display name, avatar pulled from provider).
- Users are identified across the app by their platform account; no manual profile setup required.

---

## 5. Core Concepts

### 5.1 Users
A user is anyone who has registered via social login. Users have:
- Display name and avatar (from social provider, editable).
- A list of groups they belong to.
- A global balance summary across all groups.

### 5.2 Groups
A group is the central organizing unit. All expenses belong to a group.

- A group has a name, optional description, and optional cover image.
- A group is created by one user (the **creator**) who automatically becomes a member.
- Members can be added by any existing group member via invite (link or email lookup).
- There is no concept of group "owner" beyond creation — all members have equal permissions.
- A group can be **archived** (read-only, no new expenses) but not deleted while balances are non-zero.

### 5.3 Expenses
An expense represents a real-world cost that one or more people paid and want to split.

| Field | Details |
|-------|---------|
| **Title** | Short description (e.g. "Dinner at Nobu"). |
| **Amount** | Numeric value in the expense's chosen currency. |
| **Currency** | ISO 4217 currency code (e.g. USD, EUR, GBP). |
| **Paid by** | One or more members who covered the cost, with amounts. |
| **Split among** | Subset of group members sharing the cost. |
| **Split mode** | How the cost is divided (see §6). |
| **Date** | Date the expense occurred (defaults to today). |
| **Attachments** | Zero or more images or files (e.g. receipt photos). |
| **Group** | The group this expense belongs to. |

### 5.4 Settlements
A settlement records that one member paid another to settle a debt.

- Any member can record a settlement between two members of the same group.
- Settlements reduce outstanding balances but are not processed as real payments.
- Settlements can be deleted if recorded in error (within a reasonable window).

---

## 6. Split Modes

All splits apply to the total expense amount, distributed among the selected participants.

| Mode | Description | Example |
|------|-------------|---------|
| **Equal** | Divide the total evenly among all selected participants. | $90 split 3 ways → $30 each. |
| **Percentage** | Each participant is assigned a percentage; must sum to 100%. | $90: Alice 50%, Bob 30%, Carol 20% → $45, $27, $18. |
| **Shares** | Each participant is assigned a weight; amounts are proportional. | $90: Alice ×2, Bob ×1, Carol ×1 → $45, $22.50, $22.50. |

Rounding: any cent/minor-unit remainder is assigned to the first participant alphabetically (or the payer if they are a participant).

---

## 7. Multi-Currency

- Each expense is recorded in any ISO 4217 currency.
- Group balances are displayed in a **group base currency** chosen at group creation (changeable later).
- Conversion uses daily exchange rates from a third-party FX API (e.g. Open Exchange Rates or similar).
- The exchange rate applied at the time of expense creation is stored with the expense and never retroactively changed.
- On the global balance summary page, all group balances are converted to the user's **preferred display currency** (set in profile settings).

---

## 8. Debt Simplification

SplitVibe automatically simplifies group balances to reduce the number of required payments.

**Algorithm:** Given a set of net balances within a group, compute the minimum set of directed payments that zeroes all balances (greedy min-cash-flow). This is recalculated whenever an expense or settlement is added or removed.

**Example:**
- Raw: A owes B £20, B owes C £20.
- Simplified: A owes C £20 (B is eliminated from the chain).

Simplification is applied per-group and presented as suggested settlements. Users may still record settlements in any amount/direction they choose.

---

## 9. Attachments

- Users can attach one or more files to an expense (images, PDFs, etc.).
- Max file size: **10 MB per file**, **5 files per expense**.
- Supported types: JPEG, PNG, WebP, HEIC, PDF.
- Files are stored in cloud object storage and served via signed URLs.
- Attachments are viewable by all group members.

---

## 10. Balances & Reporting

### Per-Group View
- Net balance for the current user within the group (positive = owed to you, negative = you owe).
- Simplified debt list: who owes whom and how much (in the group base currency).
- Full expense history with filters (date range, paid by, category).

### Global Dashboard
- Summary of the user's total balance across all groups, in their preferred display currency.
- Per-group balance breakdown.
- List of pending suggested settlements across all groups.

---

## 11. Permissions & Access Control

| Action | Who can do it |
|--------|--------------|
| Create a group | Any authenticated user |
| Add members to a group | Any group member |
| Add an expense | Any group member |
| Edit an expense | The member who created it |
| Delete an expense | The member who created it |
| Record a settlement | Any group member |
| Delete a settlement | Any group member (within 24 h) |
| Archive a group | Any group member |

---

## 12. Out-of-Scope Features (Future Consideration)

The following are explicitly out of scope for v1 but may be revisited:

- Real payment integrations (Venmo, PayPal, Stripe, etc.)
- Recurring/scheduled expenses
- Push, email, or in-app notifications
- Expense comments and activity log
- Direct (non-group) one-on-one expenses
- Expense categories / tagging
- Export to CSV/PDF
- AI-powered receipt scanning

---

## 13. Open Questions

1. **Invite flow** — should group invites work via a shareable link, email address lookup, or both?
2. **FX provider** — which exchange rate API to use, and how often to refresh rates?
3. **Soft delete vs. hard delete** — should deleted expenses be permanently removed or soft-deleted for audit purposes?
4. **Group base currency change** — if the base currency changes, should historical balances be recalculated or frozen at the old rate?
5. **PWA vs. native mobile** — confirm whether a PWA is sufficient or if native wrappers (React Native / Expo) are needed.
