# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Inventory dashboard for "Dermalusophy" — an RTL (right-to-left) Hebrew-language React app that displays stock levels, order tracking, and demand forecasting. Data is pulled live from a public Google Spreadsheet exported as CSV.

## Commands

All commands run from `inventory-dashboard/`:

- **Dev server:** `npm run dev` (Vite)
- **Build:** `npm run build` (runs `tsc -b && vite build`, output in `dist/`)
- **Lint:** `npm run lint` (ESLint flat config)
- **Preview production build:** `npm run preview`
- **Add shadcn/ui component:** `npx shadcn@latest add <component>`

No test framework is configured.

## Architecture

### Data Flow

Google Sheets → CSV export URLs → `src/services/googleSheets.ts` (PapaParse) → React Query hooks (`src/hooks/useSheetData.ts`) → UI components

The app fetches five sheets (inventory, products, orders, history, min-amounts) identified by GID. Sheet IDs and GIDs come from env vars (`VITE_SHEET_ID`, `VITE_INVENTORY_GID`, etc.) defined in `.env`. Column names in the CSV are in Hebrew; the service layer maps them to typed English interfaces.

### Key Files

- `src/services/googleSheets.ts` — all data fetching; parses Hebrew CSV columns into typed objects
- `src/hooks/useSheetData.ts` — React Query wrappers + derived data hooks (`useInventoryOverview`, `useLowStockItems`, `useOpenOrders`, `useProductForecast`). The forecast hook performs linear regression on history data and projects 180 days forward in 15-day intervals, incorporating expected orders as quantity jumps.
- `src/components/Dashboard.tsx` — top-level layout with QueryClientProvider, search, tab switching (graphs/orders), and summary stat cards
- `src/types/index.ts` — all shared TypeScript interfaces

### Tech Stack

- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- shadcn/ui (new-york style, non-RSC) — components in `src/components/ui/`
- Recharts for graphs
- TanStack React Query v5 (5-minute refetch interval for most queries)
- `@` path alias maps to `src/`

### Conventions

- The UI is fully RTL (`dir="rtl"` on root container)
- Low stock threshold is hardcoded at 15 units
- Order "received" status is checked against multiple Hebrew/symbol values: `["כן", "v", "✓", "true", "yes"]`
- Dates are parsed as DD/MM/YYYY (Israeli format), with fallback to ISO
