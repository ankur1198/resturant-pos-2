# Restaurant POS Fixes and Features

## Issues to Fix
- [ ] Logo not showing in print or PDF download (but shows in bill preview)
- [ ] QR code information vanishes after server restart
- [ ] Admin should have feature to delete bills from order history
- [ ] Pending orders are shown in count but no UI to view/complete them
- [x] Bill number duplicates and undefined issues after server restart

## Recent Fixes
- [x] Fixed data redundancy when admin generates bill and completes order
- [x] Fixed order history corruption after server restart (removed hardcoded sample data)
- [x] Added check to prevent completing already completed orders
- [x] Fixed bill number duplicates and undefined issues after server restart
  - [x] Modified frontend to generate temporary bill numbers (TEMP- prefix)
  - [x] Updated server to detect temporary bill numbers and generate unique server-side bill numbers
  - [x] Updated frontend to use server-generated bill numbers in responses
  - [x] Applied fix to regular orders, admin bills, and imported orders

## Implementation Plan

### 1. Fix Duplicate Order Submission
- [x] Fix duplicate assignment of `lastSentOrderId` in constructor (app.js line 17-18)
- [x] Add additional safeguards in `completeBill()` function to prevent duplicate submissions
- [x] Add button disable immediately when completing order
- [x] Add more robust order ID checking

### 2. Fix Logo in Print and PDF
- [ ] Update `printBill()` method to include logo image
- [ ] Update `downloadPDF()` method to include logo image
- [ ] Test logo display in both print and PDF

### 3. QR Code Persistence
- [ ] Ensure uploaded QR images are saved to backend via `/api/qr-config`
- [ ] Load QR config from backend on app initialization
- [ ] Test QR persistence across server restarts

### 4. Admin Bill Deletion
- [x] Add DELETE `/api/orders/:id` endpoint in server.js
- [x] Add delete button in admin order history UI
- [x] Implement `deleteOrder()` method in frontend
- [x] Add confirmation dialog for deletion

### 5. Pending Orders Management
- [x] Add "Pending Orders" section in admin dashboard
- [x] Add "Pending Orders" section for cashiers
- [x] Implement methods to view and complete pending orders
- [x] Update order status from 'pending' to 'completed'

### 6. Test All Fixes
- [ ] Restart server and test all functionality
- [ ] Verify no duplicate orders are created
- [ ] Confirm logo shows in print/PDF
- [ ] Confirm QR settings persist
