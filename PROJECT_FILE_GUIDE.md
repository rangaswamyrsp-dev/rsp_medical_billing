# RSP Medical Billing Software — File & Page Guide

This guide details every file, folder, and route in the project. Use this reference to quickly find which file to edit for any feature, page, or data change.

---

## 📁 1. Page Routes (`src/routes/_app/`)

All main application pages are organized cleanly in `src/routes/_app/`.

| File Path | Web URL | One-Line Purpose & Data Usage |
| :--- | :--- | :--- |
| [index.tsx 2
| [dashboard.tsx src/routes/_app/dashboard.tsx) | `/dashboard` | **Dashboard Summary**: Displays today's sales stats, low stock warnings, expiring items list, and quick analytics widgets. |
| [sales.tsx src/routes/_app/sales.tsx) | `/sales` | **Sales History**: Lists all completed bills with date/customer filters, invoice previews, and reprint options. |
| [purchase.tsx src/routes/_app/purchase.tsx) | `/purchase` | **Purchase Orders**: Logs inward stock purchases from suppliers/stockists and updates inventory quantities. |
| [inventory.tsx src/routes/_app/inventory.tsx) | `/inventory` | **Stock Inventory**: View overall stock quantities, batch details, total stock valuation, and low stock items. |
| [medicines.tsx src/routes/_app/medicines.tsx) | `/medicines` | **Medicine Master**: Add, edit, or delete medicines, set MRP prices, GST rates, manufacturer names, and expiry dates. |
| [customers.tsx src/routes/_app/customers.tsx) | `/customers` | **Customer Directory**: Manage customer names, phone numbers, doctor references, and outstanding ledger balances. |
| [suppliers.tsx src/routes/_app/suppliers.tsx) | `/suppliers` | **Supplier Directory**: Manage stockist contacts, GSTIN numbers, and payable ledger balances. |
| [employees.tsx src/routes/_app/employees.tsx) | `/employees` | **Staff Management**: Add/edit employees, assign roles (Admin, Pharmacist, Cashier), and set logins. |
| [reports.tsx src/routes/_app/reports.tsx) | `/reports` | **Reports & Analytics**: View revenue graphs, profit & loss summaries, and top-selling product charts. |
| [gst.tsx src/routes/_app/gst.tsx) | `/gst` | **GST Tax Reports**: Generates GSTR-1 and GSTR-3B tax summaries with CSV/Excel export options. |
| [accounts.tsx src/routes/_app/accounts.tsx) | `/accounts` | **Ledger Accounts**: Track income, operational expenses, and store financial balances. |
| [audit.tsx src/routes/_app/audit.tsx) | `/audit` | **Audit Logs**: Displays security activity logs (user logins, bill cancellations, price edits). |
| [backup.tsx src/routes/_app/backup.tsx) | `/backup` | **Backup & Restore**: Export full JSON database backups, restore previous backups, or reset store data. |
| [settings.tsx src/routes/_app/settings.tsx) | `/settings` | **Store & Printer Settings**: Configure store name, GSTIN, thermal printer paper size (58mm/80mm/A4), and auto-print. |
| [help.tsx src/routes/_app/help.tsx) | `/help` | **Help & Keyboard Manual**: User manual and keyboard shortcut quick reference (F2, F9, F10). |
| [barcode.tsx src/routes/_app/barcode.tsx) | `/barcode` | **Barcode Generator**: Generates and prints barcode labels for medicine batches. |
| [qr.tsx src/routes/_app/qr.tsx) | `/qr` | **UPI QR Generator**: Creates standalone UPI payment QR codes for desk display. |

---

## 🔐 2. Top-Level Routes (`src/routes/`)

| File Path | Web URL | One-Line Purpose & Data Usage |
| :--- | :--- | :--- |
| [_app.tsx src/routes/_app.tsx) | *Layout* | **App Layout Shell**: Outer layout wrapper that renders the left sidebar, top header, authentication check, and route outlet. |
| [__root.tsx src/routes/__root.tsx) | *Root* | **HTML Document Root**: Renders `<html>`, `<head>`, CSS stylesheets, global error boundaries, and toast notifications. |
| [login.tsx src/routes/login.tsx) | `/login` | **Login Screen**: User login interface with cashier pin selection and password authentication. |
| [superadmin.tsx src/routes/superadmin.tsx) | `/superadmin` | **SuperAdmin Portal**: Tenant administration for enabling/disabling module features and managing store instances. |

---

## ⚡ 3. Core Logic & State Management (`src/lib/` & `src/data/`)

| File Path | One-Line Purpose & Data Usage |
| :--- | :--- |
| [store.ts src/lib/store.ts) | **Central Data Store**: LocalStorage state for sales, medicines, customers, suppliers, held bills, and printer settings. |
| [auth.ts src/lib/auth.ts) | **Authentication Service**: Manages current user session (`getUser`), login, logout, and staff credentials. |
| [tenant.ts src/lib/tenant.ts) | **Feature Flags & Store Type**: Configures store branding, feature flags (GST, Doctor field, Barcode, etc.), and text labels. |
| [print.ts src/lib/print.ts) | **Thermal Print Engine**: Formats receipts and triggers browser print window for 58mm/80mm thermal printers or A4. |
| [vision.functions.ts src/lib/vision.functions.ts) | **AI Bill Reader**: Server function that parses invoice photos and extracts tab-separated medicine rows using AI. |
| [medicines.ts src/data/medicines.ts) | **Seed Medicine Catalog**: Initial default list of medicines and stock data used for first-time store initialization. |

---

## 🎨 4. Application Components (`src/components/app/`)

| File Path | One-Line Purpose & Data Usage |
| :--- | :--- |
| [AppSidebar.tsx src/components/app/AppSidebar.tsx) | **Left Navigation Bar**: Collapsible sidebar containing brand logo, page navigation links, and logout button. |
| [AppHeader.tsx src/components/app/AppHeader.tsx) | **Top Header Bar**: Header bar containing global search input, low-stock/expiry notifications popover, and user profile menu. |
| [BarcodeScanner.tsx src/components/app/BarcodeScanner.tsx) | **Camera Barcode/QR Modal**: Camera video modal for scanning medicine barcodes and QR codes directly into the bill. |
| [BulkImportDialog.tsx src/components/app/BulkImportDialog.tsx) | **Excel Import Modal**: Allows importing bulk medicine lists and stock data from `.xlsx` or `.csv` files. |
| [ChatHelpFab.tsx src/components/app/ChatHelpFab.tsx) | **AI Assistant Drawer**: Floating action button and chat assistant drawer for quick software help. |

---

## 🛠️ 5. UI Elements & Configuration (`src/components/ui/` & root files)

| File Path | One-Line Purpose & Data Usage |
| :--- | :--- |
| [components/ui/ src/components/ui) | **Reusable UI Components**: Radix-UI buttons, inputs, dialogs, tables, popovers, select dropdowns, cards, badges, and tabs. |
| [vite.config.ts vite.config.ts) | **Vite Build Config**: Configures Vite build system, Tailwind CSS v4, TypeScript path aliases (`@/`), and Nitro server. |
| [package.json package.json) | **Package Dependencies**: Project NPM packages, build scripts (`npm run dev`, `npm run build`), and version info. |
