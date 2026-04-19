## 2024-05-22 - [React Render Loop Optimization]
**Learning:** In data-intensive dashboards, calculating financial metrics (Sharpe, Volatility, MaxDD) inside the render loop for multiple items causes measurable UI jank. Even if the math is relatively simple, doing it on every state change (like theme toggles) is wasteful.
**Action:** Always move financial metric calculations into a `useMemo` block that only updates when the underlying data changes. Consolidate these calculations at the highest necessary parent to avoid duplicate work across components.
