# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Inventory dashboard for "Dermalusophy" — an RTL (right-to-left) Hebrew-language React app that displays stock levels, order tracking, and demand forecasting. Data is pulled live from a public Google Spreadsheet exported as CSV. Write operations (add product, add order, update status, update comments) go through a Google Apps Script web app.

## Commands

All commands run from `inventory-dashboard/`:

- **Dev server:** `npm run dev` (Vite)
- **Build:** `npm run build` (runs `tsc -b && vite build`, output in `dist/`)
- **Lint:** `npm run lint` (ESLint flat config)
- **Preview production build:** `npm run preview`
- **Add shadcn/ui component:** `npx shadcn@latest add <component>`
- **Deploy:** `vercel --prod` (from `inventory-dashboard/`)

No test framework is configured.

## Architecture

### Data Flow

**Read path:** Google Sheets → CSV export URLs → `src/services/googleSheets.ts` (PapaParse) → React Query hooks (`src/hooks/useSheetData.ts`) → UI components

**Write path:** UI components → mutation hooks (`useSheetData.ts`) → `googleSheets.ts` POST to Apps Script (`VITE_APPS_SCRIPT_URL`) → `apps-script-code.js` (Google Apps Script) → Google Sheets

The app fetches five sheets (inventory, products, orders, history, min-amounts) identified by GID. Sheet IDs and GIDs come from env vars defined in `.env`. Column names in the CSV are in Hebrew; the service layer maps them to typed English interfaces.

### Key Files

**Services & Hooks:**
- `src/services/googleSheets.ts` — all data fetching (CSV reads via PapaParse) and write operations (POST to Apps Script); parses Hebrew CSV columns into typed objects
- `src/hooks/useSheetData.ts` — React Query wrappers + derived data hooks (`useInventoryOverview`, `useLowStockItems`, `useOpenOrders`, `useProductForecast`) + mutation hooks with optimistic updates
- `src/types/index.ts` — all shared TypeScript interfaces

**Components:**
- `src/components/Dashboard.tsx` — top-level layout with QueryClientProvider, search, tab switching (graphs/orders), and summary stat cards
- `src/components/ProductGraph.tsx` — Recharts forecast chart with zoom/pan controls and touch support
- `src/components/OpenOrders.tsx` — order list grouped by product, tap-to-expand on mobile, status toggle, inline comments editing
- `src/components/InventoryOverview.tsx` — full product inventory table with search filtering
- `src/components/LowStock.tsx` — items below minimum stock threshold
- `src/components/AddOrderDialog.tsx` — order creation modal with product auto-fill selector and log field
- `src/components/AddProductDialog.tsx` — product creation modal

**Backend:**
- `apps-script-code.js` (repo root) — Google Apps Script web app handling `addProduct`, `addOrder`, `updateOrderStatus`, `updateOrderComments`, and `syncMissingProducts` actions

### Tech Stack

- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin)
- shadcn/ui (new-york style, non-RSC) — components in `src/components/ui/`
- Recharts for graphs
- TanStack React Query v5
- `@` path alias maps to `src/`
- Deployed on Vercel

### Environment Variables

All defined in `inventory-dashboard/.env`:

| Variable | Purpose |
|---|---|
| `VITE_SHEET_ID` | Google Spreadsheet document ID |
| `VITE_INVENTORY_GID` | GID for the inventory sheet |
| `VITE_ORDERS_GID` | GID for the orders sheet |
| `VITE_PRODUCTS_GID` | GID for the products sheet |
| `VITE_HISTORY_GID` | GID for the history (sales) sheet |
| `VITE_MIN_AMOUNT_GID` | GID for the minimum amounts sheet |
| `VITE_APPS_SCRIPT_URL` | Google Apps Script web app URL for write operations |

## Conventions

- The UI is fully RTL (`dir="rtl"` on root container)
- Low stock threshold is hardcoded at 15 units
- Order "received" status is checked against multiple Hebrew/symbol values: `["כן", "v", "✓", "true", "yes"]`
- Dates are parsed as DD/MM/YYYY (Israeli format), with fallback to ISO
- Forecast: linear regression on history data, projects 180 days forward in 7-day (weekly) intervals, incorporating expected order arrivals as quantity jumps
- Refetch intervals: 5 min (inventory, orders, history), 10 min (products, min-amounts)
- Optimistic updates on order status toggles and comment edits (with rollback on error)
- Hebrew column names in CSV are mapped to English TypeScript interfaces in the service layer

## Deployment

- Hosted on **Vercel**
- Deploy command: `vercel --prod` (run from `inventory-dashboard/`)
- Vercel project name: `inventory-dashboard`
