# Restaurant POS Fixes - TODO List

## Issue 1: Data Redundancy from Admin Bills
- [ ] Move duplication check to after server response in saveAdminBill()
- [ ] Use server-generated bill number for duplicate detection
- [ ] Improve duplicate prevention logic

## Issue 2: Bill Number Visibility After Server Restart
- [ ] Ensure proper parsing of bill numbers in loadDataFromServer()
- [ ] Fix order history display to show bill numbers correctly
- [ ] Improve currentOrder restoration logic
- [ ] Add validation for bill number display in UI components

## Testing
- [ ] Test admin bill creation (no duplicates)
- [ ] Test server restart and bill number visibility
- [ ] Test order details modal shows correct bill numbers
- [ ] Test both cashier and admin-generated orders
