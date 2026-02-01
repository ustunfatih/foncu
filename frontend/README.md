# TEFAS dashboard frontend

A Vite + React single-page app ready for Vercel static deployment. It ships with mock data so you can wire it to the TEFAS crawler API later.

## Scripts
- `npm run dev` – local development server
- `npm run build` – production build (used by Vercel)
- `npm run preview` – preview the production build locally

## Hooking up real data
1. Swap the mock data in `src/data/mockFunds.ts` with calls to your backend API.
2. Connect the fund selector to your search endpoint so the dropdown stays responsive with the full TEFAS catalog.
3. Deploy via Vercel; the provided `vercel.json` points the build to `frontend/` and publishes `frontend/dist`.
