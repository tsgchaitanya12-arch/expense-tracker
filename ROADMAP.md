# Ledger — Product Roadmap

Ledger started as a hackathon prototype but is designed around a bigger
vision: a personal financial operating system that turns scattered
financial evidence (receipts, bank texts, memory) into a structured,
explainable understanding of your money — not just another manual
expense log.

This document splits that vision into **what's built today**, and
**what a real backend-and-AI version would require**, so the gap
between prototype and product is explicit rather than hand-waved.

## What's built (client-side only, no backend)

- Full transaction schema: amount, category, date, time, payment
  method, tags, optional photo
- Custom categories, monthly budget with live progress + over-budget
  warnings
- Home dashboard: available balance, month-vs-last-month trend,
  category spend ring, today/month summaries, spending timeline,
  auto-generated monthly digest
- Month-end forecast (linear projection from days elapsed)
- "What if" savings simulator
- Goals engine with target/current/monthly contribution and
  time-to-goal estimate
- Receipt vault: searchable/filterable archive with photo attachments
  and tags
- Category doughnut chart, weekday spending heatmap, time-of-day
  insight, top merchant ranking
- Statistical anomaly flagging (amount vs. historical mean + std dev)
- Explainable financial health score — every sub-score shows exactly
  how it's calculated, no black box
- Gamification: logging streaks, achievement badges
- Local rule-based "assistant" that answers a few recognized question
  patterns against your own stored data (not a connected LLM)
- Voice input via the browser's built-in Web Speech API
- Best-effort text parser for pasted SMS/bank transaction lines
- CSV import/export
- Personalizable home screen (toggle widgets on/off)
- Dark mode, fully responsive, works offline once loaded (data is
  local to the browser)

## What needs a real backend (not built here, and why)

| Feature | Why it can't live in this static site |
|---|---|
| Receipt OCR + AI field extraction | Needs a hosted OCR/vision model. Running this from the browser means exposing an API key publicly — anyone viewing the page source could steal it and rack up charges on your account. |
| Conversational AI copilot (real LLM) | Same API-key problem, at larger scale. A real version needs a backend that holds the key server-side and proxies requests. |
| Bank / UPI integration | Needs OAuth with a licensed aggregator (e.g. Plaid-equivalent), plus compliance most companies spend months on. Never something to fake. |
| Email receipt scanning | Needs OAuth into the user's inbox and a backend job to parse messages — a static site has nowhere to run that job. |
| Cross-device sync | Needs a real database (Postgres) and authenticated API. Right now data lives only in one browser's local storage. |
| Encrypted backups / account security | Needs server-side auth (e.g. hashed credentials, sessions) — there's no server here to hold that securely. |

## Proposed architecture for the full version

```
USER
 │
 ▼
INTENT DETECTION → TOOL SELECTION → DATABASE / ANALYTICS
 │                                         │
 └──────────── STRUCTURED RESULT ◄─────────┘
 │
 ▼
LLM EXPLANATION (turns the structured result into a sentence)
 │
 ▼
USER
```

The key principle: **the LLM explains, it never calculates.** Balances,
totals, and budget math run in deterministic code every time — the
model's job is just to describe the result in plain language and
route natural-language questions to the right query. This keeps the
assistant accurate and avoids the "AI got the math wrong" failure mode
that undermines trust in finance apps specifically.

### Suggested stack for the full version
- **Frontend:** React (Next.js), Tailwind, Framer Motion for
  micro-interactions, Recharts/D3 for charts
- **Backend:** Node.js/TypeScript API, tool-based architecture
  (`get_spending_by_category()`, `create_goal()`, etc.) that an LLM
  orchestrates rather than talks to a database directly
- **Database:** PostgreSQL via Prisma
- **OCR:** a dedicated hosted OCR/vision API, called server-side only
- **Storage:** object storage for receipt images
- **Auth:** proper session-based auth, encrypted backups, and a clear,
  written data policy for anything sent to an external AI service

## Design principle carried through both versions

Every number the user sees should be explainable on click — "why am I
seeing this insight, based on what data, with what confidence" — never
a black-box "AI says." That principle is already implemented in the
health score above, and is meant to extend to every future AI feature.
