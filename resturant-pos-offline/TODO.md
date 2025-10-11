# TODO: Enhance Sales Charts in Restaurant POS System

## Overview
This TODO tracks the implementation of the approved plan to improve chart functionality in `public/app.js` (and potentially `style.css`). The goal is to enhance compatibility with Chart.js v4.5.0, add error handling, improve UX, and optimize performance.

## Steps

### 1. Analyze Existing Styling
- [x] Read and analyze `public/style.css` to check for chart container styling (e.g., #paymentChart) and identify any responsiveness issues (e.g., fixed height on mobile).
- [x] If issues found, plan CSS edits (e.g., add media queries for height adjustment).

### 2. Refactor Chart Method Naming
- [ ] Rename `updatePaymentChart` to `updateSalesChart` in `app.js`.
- [ ] Update all references/calls to the new method name (e.g., in loadSalesReports, chart type buttons).

### 3. Add Error Handling
- [ ] Wrap Chart.js creation in try-catch blocks within the chart config getters (e.g., getPaymentChartConfig, getItemSalesChartConfig, etc.).
- [ ] On error, log to console and show a toast notification (e.g., "Failed to load chart: [error]").
- [ ] Ensure chart destruction handles errors gracefully.

### 4. Improve Data Handling
- [ ] In `getCategoryChartConfig`, add fuzzy matching for menu items (e.g., using simple string includes or a library if needed, but keep lightweight).
- [ ] In `loadSalesReports`, add a check: if filtered orders.length === 0, display "No data available for this period" in the chart container and skip chart update.

### 5. Optimize Polling and Performance
- [ ] Modify the polling logic in the constructor or sales section handler: Start interval only when #salesSection is active (use event listeners for nav switches), clear interval when switching away.
- [ ] Reduce poll frequency if no changes detected (optional, but add comment for future).

### 6. Enhance Chart UX
- [ ] Add animation: true and duration: 1000 to options in all chart configs.
- [ ] Ensure consistent color schemes across charts (e.g., define a global color palette array).
- [ ] Enable tooltips on all charts with custom callback for currency formatting (e.g., '₹' + value).

### 7. CSS Adjustments (If Needed)
- [ ] Edit `public/style.css` to make #paymentChart responsive (e.g., height: 100%; min-height: 400px; with flex or media queries).

### 8. Testing and Verification
- [ ] Use browser_action to launch http://localhost:3000, login as admin, navigate to Sales Reports.
- [ ] Test: Switch periods (today/week/month), chart types, verify rendering, error handling (e.g., simulate empty data), polling updates.
- [ ] Check console for errors, ensure no breakage in other sections.
- [ ] If server not running, restart with npm start.

### 9. Final Review
- [ ] Update this TODO.md with completion marks [x].
- [ ] Run any linter checks if applicable.
- [ ] Attempt completion once all verified.

Progress: 1/9 steps complete.
