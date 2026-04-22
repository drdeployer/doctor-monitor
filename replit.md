# Workspace

## Overview

Real-time crypto node monitoring web platform — "Node Monitor". Cyberpunk terminal aesthetic (pure black + white monospace). Operators register nodes (nickname, wallet, GPU, network, VRAM); the app fetches reward transactions from the Monad explorer (BlockVision API), filters valid rewards (amount > 1 and != 1000), and displays a live network grid with auto-refresh every 15s.

## Stack

- **Monorepo**: pnpm workspaces, TypeScript 5.9, Node 24
- **Frontend**: React + Vite + Tailwind v4 (`artifacts/node-monitor`), wouter, TanStack Query, framer-motion, react-hook-form + zod
- **Backend**: Express 5 (`artifacts/api-server`)
- **DB**: PostgreSQL + Drizzle (`lib/db`); `nodes` table
- **API contract**: OpenAPI in `lib/api-spec/openapi.yaml`, codegen via Orval → `@workspace/api-client-react` and `@workspace/api-zod`
- **Explorer integration**: BlockVision Monad API (`artifacts/api-server/src/lib/blockvision.ts`); set `BLOCKVISION_API_KEY` secret for full data access. In-memory 30s reward cache.

## Endpoints

- `GET /api/nodes` — list nodes with computed reward stats
- `POST /api/nodes` — create node (validates 0x… 40-hex wallet)
- `PATCH /api/nodes/:id` — update node
- `DELETE /api/nodes/:id` — delete node
- `GET /api/nodes/session/:sessionId` — list nodes for a browser session
- `GET /api/nodes/:id/transactions` — recent reward txs for a node
- `GET /api/network/summary` — totals + online count + daily rewards

## Pages

- `/` — Live Node Network (cards + animated SVG connections, summary strip, auto-refresh)
- `/dashboard` — Personal dashboard (per-browser session via localStorage UUID)

## Key Commands

- `pnpm run typecheck`
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks/zod from OpenAPI
- `pnpm --filter @workspace/db run push` — apply schema
- `pnpm --filter @workspace/api-server run dev` — backend
- `pnpm --filter @workspace/node-monitor run dev` — frontend
