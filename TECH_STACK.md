# VASUDHA OS — Technology Stack

<p align="center">
  <strong>Complete Technology Inventory & Rationale</strong><br/>
  <em>Every technology choice explained and justified</em>
</p>

---

## Table of Contents

- [Stack Overview](#stack-overview)
- [Core Framework](#core-framework)
- [Language](#language)
- [Database & Storage](#database--storage)
- [State Management](#state-management)
- [UI & Design](#ui--design)
- [Data Handling](#data-handling)
- [Testing Stack](#testing-stack)
- [Code Quality](#code-quality)
- [Build & CI/CD](#build--cicd)

---

## Stack Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        VASUDHA OS                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend/UI           │  Next.js 16 (React 19) + Tailwind 4 │
│  Language              │  TypeScript                         │
│  State Management      │  Zustand                            │
│  Database & Backend    │  Supabase (PostgreSQL)              │
│  Data Fetching         │  Supabase SSR                       │
│  Forms & Validation    │  React Hook Form + Zod              │
│  Charts/Graphs         │  Recharts                           │
│  PDF Generation        │  @react-pdf/renderer                │
│  CI/CD                 │  Vercel / GitHub Actions            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Core Framework

### Next.js (App Router)

| Attribute | Details |
|-----------|---------|
| **Version** | 16.x |
| **Paradigm** | Server Components by default |
| **Target Platforms** | Web App (Responsive Desktop & Mobile) |

### Why Next.js?

- **Server Components:** Fetches data directly from PostgreSQL (via Supabase) with zero client-side JavaScript overhead.
- **File-based Routing:** Intuitive app routing layout (e.g. `app/(app)/dashboard/page.tsx`).
- **SSR & SEO:** Instant page loads and optimized rendering out-of-the-box.
- **Enterprise Ready:** Vercel-backed, widely adopted in the React ecosystem.

---

## Language

### TypeScript

| Feature | Benefit for VASUDHA OS |
|---------|----------------------|
| **Strict Typing** | Eliminates runtime type errors — critical for financial data |
| **Interfaces** | Perfect for database schema representation (Supabase types) |
| **Tooling** | First-class autocomplete and inline error checking |

---

## Database & Storage

### Supabase (PostgreSQL)

| Attribute | Details |
|-----------|---------|
| **Client Package** | `@supabase/supabase-js`, `@supabase/ssr` |
| **Database** | PostgreSQL |
| **Authentication** | Supabase Auth (integrated with Next.js Cookies) |
| **Security** | Row Level Security (RLS) and DB Triggers |

### Why Supabase?

- **Relational Power:** Complex SQL aggregations, foreign keys, and views perfect for an ERP.
- **Mathematical Purity:** Business logic (aging, total balance, auto-invoicing) lives directly in PostgreSQL via RPCs and Triggers, ensuring 100% data consistency.
- **Security:** RLS policies ensure strict data isolation between companies directly at the database layer.

---

## State Management

### Zustand

| Attribute | Details |
|-----------|---------|
| **Package** | `zustand` |
| **Use Case** | Lightweight client-side global state (User Profile, UI toggles) |

### Why Zustand?

- **Zero Boilerplate:** Very simple API compared to Redux.
- **Hooks-based:** Fits perfectly with React 19's ecosystem.
- **Performance:** Does not re-render the entire app on state changes.

---

## UI & Design

### Tailwind CSS v4

| Component | Purpose |
|-----------|---------|
| Design System | Rapid UI building via utility classes |
| Icons | `lucide-react` for beautiful SVG icons |
| Components | Custom built using Tailwind classes |

### Charts & Data Visualization

| Package | Use Case |
|---------|----------|
| `recharts` | Responsive React charting library for dashboard trends |

---

## Data Handling

### Validation

| Package | Purpose |
|---------|---------|
| `zod` | Schema declaration and validation |
| `@hookform/resolvers` | Connecting Zod schemas to React Hook Form |

### Forms

| Package | Purpose |
|---------|---------|
| `react-hook-form` | Performant, flexible, and extensible forms with easy-to-use validation |

---

## PDF & Document Generation

| Package | Purpose |
|---------|---------|
| `@react-pdf/renderer` | Generating React components into standard PDF documents |
| Custom CSV Export | Native JavaScript Blob and URL.createObjectURL |

---

## Code Quality

### Linting & Formatting

| Tool | Purpose |
|------|---------|
| `eslint` | Catching errors and enforcing code consistency |
| `eslint-config-next` | Next.js specific lint rules |

---

<p align="center">
  <strong>VASUDHA OS Tech Stack</strong> — Chosen for speed, security, and enterprise scalability. ⚙️
</p>
