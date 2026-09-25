# RSP Medical Billing & Multi-Tenant Retail Management Software

A modern, high-performance, full-featured **Desktop & Web Medical Billing, Pharmacy Management, and Multi-Tenant Retail ERP System**. Built with **React 19, TypeScript, TanStack Start & Router, Vite 8, Tailwind CSS v4, and Radix UI**, this software is designed for lightning-fast daily counter operations, strict FEFO (First-Expiry-First-Out) inventory tracking, automated GST compliance, customer credit loans, employee attendance and payroll, and multi-business SaaS provisioning.

---

## 📑 Table of Contents

1. [Executive Overview](#-executive-overview)
2. [Complete Technology Stack](#-complete-technology-stack)
3. [Project Directory & File Structure](#-project-directory--file-structure)
4. [Data Storage & Persistence Architecture](#-data-storage--persistence-architecture)
5. [Multi-Tenant Architecture & Business Verticals](#-multi-tenant-architecture--business-verticals)
6. [Role-Based Access Control (RBAC)](#-role-based-access-control-rbac)
7. [Module-by-Module Feature Breakdown](#-module-by-module-feature-breakdown)
8. [Core Business Logic & Algorithms](#-core-business-logic--algorithms)
9. [Hardware & Peripheral Integrations](#-hardware--peripheral-integrations)
10. [Configuration & Environment Setup](#-configuration--environment-setup)
11. [Running & Building the Application](#-running--building-the-application)

---

## 🌟 Executive Overview

* **Primary Business Domain:** Medical Store / Pharmacy Billing & Inventory Management (with native support for Supermarket, Hotel/Restaurant, and Automobile Garage business models).
* **Architecture Style:** Client-first Fullstack SPA with Server Functions powered by TanStack Start and Nitro.
* **Target Platforms:** Windows Desktop (Edge/Chrome Webview, Electron, or PWA) and Responsive Mobile Web.
* **Primary Client Profile:** ANAM Medical Store (KL Road, Hindupur - 515201).
* **Key Design Principles:**
  * **Zero-Latency Billing:** Keyboard-driven counter POS with barcode scanning and instant F2 hotkey navigation.
  * **Data Isolation:** Complete multi-tenant isolation via dynamic scoped storage keys.
  * **Offline Resilience:** Instant local storage persistence with zero dependency on round-trip network latency for critical billing flows.
  * **Accounting & Compliance Ready:** Automated GST computations, HSN rate classification, Input Tax Credit (ITC) tracking, and export-ready CSV/PDF reports.

---

## 💻 Complete Technology Stack

### 1. Frontend Core & Runtime
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>=20.x` / `>=22.x` | JavaScript runtime environment |
| **TypeScript** | `^5.8.3` | Strict static type checking and contracts across all modules |
| **React** | `^19.2.0` | Latest React engine utilizing hooks and `useSyncExternalStore` |
| **React DOM** | `^19.2.0` | React DOM renderer |
| **Vite** | `^8.0.16` | Next-generation ultra-fast frontend build tool and dev server |

### 2. Routing, Framework & Server
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **TanStack Start** | `^1.168.26` | Full-stack framework on top of TanStack Router |
| **TanStack Router** | `^1.170.16` | Type-safe file-based client routing with automatic route tree generation |
| **TanStack Query** | `^5.101.1` | Asynchronous data management and server caching layer |
| **Nitro** | `3.0.260603-beta` | High-performance universal server engine for production build output |
| **Zod** | `^3.24.2` | Schema validation for server functions and data parsing |

### 3. Styling & UI Component System
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **Tailwind CSS** | `^4.2.1` | Next-gen CSS engine using modern CSS variables and `@theme inline` |
| **@tailwindcss/vite** | `^4.2.1` | Native Vite integration for Tailwind v4 compilation |
| **Radix UI Primitives** | Various | Headless accessible UI primitives (Dialog, Select, Popover, Dropdown, Table, Tabs, Sheet, etc.) |
| **Lucide React** | `^0.575.0` | Comprehensive, consistent SVG icon library |
| **Sonner** | `^2.0.7` | Rich, animated toast notifications |
| **tw-animate-css** | `^1.3.4` | CSS animations for modal transitions and alert banners |
| **Recharts** | `^2.15.4` | SVG charting library for visual dashboard analytics |

### 4. Data Processing & External Integrations
| Technology | Version | Purpose |
| :--- | :--- | :--- |
| **@supabase/supabase-js** | `^2.112.4` | Supabase PostgreSQL client for optional cloud backup and sync |
| **XLSX (SheetJS)** | `^0.18.5` | Client-side Excel `.xlsx`, `.xls`, and `.csv` parsing and template imports |
| **date-fns** | `^4.1.0` | High-precision date math and formatting utilities |
| **cmd-k** / **input-otp** | `^1.1.1` / `^1.4.2` | Command palette and OTP input interfaces |

---

## 📁 Project Directory & File Structure

```
c:/RSP Softwares/Medical billing software/
├── .tanstack/                     # TanStack Router generated metadata
├── public/                        # Static assets (favicons, logos, manifests)
├── src/
│   ├── components/
│   │   ├── app/                   # Application-specific high-level components
│   │   │   ├── AppHeader.tsx      # Top bar (Search, Tenant Switcher, Profile, Branch info)
│   │   │   ├── AppSidebar.tsx     # Navigation sidebar with dynamic capability filtering
│   │   │   ├── BarcodeScanner.tsx # Hardware & camera barcode scanner bridge
│   │   │   ├── BulkImportDialog.tsx# Excel & AI Camera Photo product importer
│   │   │   ├── ChatHelpFab.tsx    # Floating Action Button for in-app contextual assistance
│   │   │   └── StubPage.tsx       # Fallback placeholder component
│   │   └── ui/                    # 46 Radix UI base components (Button, Card, Table, Dialog, etc.)
│   ├── data/
│   │   └── medicines.ts           # Initial demo dataset (medicine batches, MRP, expiry, GST rates)
│   ├── hooks/
│   │   └── use-mobile.tsx         # Viewport breakpoint detection hook (< 768px / mobile)
│   ├── lib/
│   │   ├── auth.ts                # Authentication engine, RBAC permission matrix (CAN), password generator
│   │   ├── code128.ts             # Pure TypeScript Code 128 barcode symbology encoder
│   │   ├── error-capture.ts       # Global unhandled error listening and logging
│   │   ├── error-page.ts          # Fatal crash recovery UI renderer
│   │   ├── expiry.ts              # Expiry date parsing, FEFO priority calculation, status helper
│   │   ├── print.ts               # Thermal (58mm, 80mm) and A4 print engine with CSS formatting
│   │   ├── store.ts               # Core reactive state store, multi-tenant persistence, audit logger
│   │   ├── supabase.ts            # Supabase Cloud Client initialization
│   │   ├── tenant.ts              # Multi-tenant registry, business verticals, and feature flags engine
│   │   ├── utils.ts               # Class name merger (`cn` utility via clsx and tailwind-merge)
│   │   └── vision.functions.ts    # AI Vision server function for OCR photo-to-table bill parsing
│   ├── routes/
│   │   ├── __root.tsx             # Root layout with Toaster, Router context, and Meta tags
│   │   ├── _app.tsx               # Protected application shell (Sidebar + Header + Content)
│   │   ├── login.tsx              # Role-based & multi-tenant user authentication screen
│   │   ├── superadmin.tsx         # Master SaaS tenant management and feature-flag toggling
│   │   └── _app/                  # Application Route Pages (see Module Breakdown)
│   │       ├── index.tsx          # Main Billing Counter (POS)
│   │       ├── dashboard.tsx      # Executive Dashboard
│   │       ├── sales.tsx          # Sales & Invoices History
│   │       ├── purchase.tsx       # Purchase Orders & Stock Inward
│   │       ├── inventory.tsx      # Inventory & Batch Management
│   │       ├── medicines.tsx      # Product / Medicine Catalog Master
│   │       ├── customers.tsx      # Customer Directory & CRM
│   │       ├── suppliers.tsx      # Supplier Directory & Payables
│   │       ├── employees.tsx      # Staff, Attendance & Payroll Management
│   │       ├── loans.tsx          # Customer Credit Loans & Repayment Ledger
│   │       ├── gst.tsx            # Full 9-Tab GST Reports & Filing Module
│   │       ├── accounts.tsx       # Income & Expense Ledger with Custom Categories
│   │       ├── reports.tsx        # 12+ Business Analytics Reports
│   │       ├── audit.tsx          # Immutable Audit Log Trail
│   │       ├── barcode.tsx        # Barcode Label Sheet Generator
│   │       ├── qr.tsx             # Dynamic UPI & Medicine QR Generator
│   │       ├── settings.tsx       # Printer & Store Configuration
│   │       ├── backup.tsx         # JSON Backup Export & Import
│   │       └── help.tsx           # User Manual & Keyboard Shortcuts
│   ├── routeTree.gen.ts           # Automatically generated TanStack route tree
│   ├── router.tsx                 # TanStack Router instance creation and React Query integration
│   ├── server.ts                  # Server entry point for Nitro runtime
│   ├── start.ts                   # TanStack Start client bootstrap entry
│   └── styles.css                 # Tailwind CSS v4 design system, color tokens, and light/dark theme
├── components.json                # Shadcn / UI configuration
├── package.json                   # Project scripts and dependency declarations
├── tsconfig.json                  # TypeScript compiler settings and path aliases (`@/*`)
└── vite.config.ts                 # Vite bundler, Tailwind, TSConfig Paths, and TanStack Start plugins
```

---

## 🗄️ Data Storage & Persistence Architecture

### Current Storage Engine: Multi-Tenant LocalStorage

The application uses an **in-browser reactive storage architecture** backed by `localStorage` with real-time UI synchronization via React 19's `useSyncExternalStore`.

```
┌────────────────────────────────────────────────────────────────┐
│                         React UI Tree                          │
└───────────────▲────────────────────────────────┬───────────────┘
                │ useSyncExternalStore           │ actions.*
                │ (reactive subscribe)           │ (mutations)
┌───────────────┴────────────────────────────────▼───────────────┐
│                      Central Store (store.ts)                  │
│  - In-Memory Cache (state)                                     │
│  - FEFO Stock Calculation Engine                               │
│  - Audit Logging Pipeline                                      │
└───────────────▲────────────────────────────────┬───────────────┘
                │ load() on switch               │ persist()
┌───────────────┴────────────────────────────────▼───────────────┐
│                 Browser LocalStorage Engine                    │
│  - Key: "rsp_store_v1" (Default / Legacy Tenant)               │
│  - Key: "rsp_store_tenant_T001" (Tenant A)                     │
│  - Key: "rsp_store_tenant_T002" (Tenant B)                     │
│  - Key: "rsp_tenants_v1" (Tenant Registry)                     │
│  - Key: "rsp_auth_user" (Current Active Session)               │
└────────────────────────────────────────────────────────────────┘
```

#### Storage Keys & Structure

1. **`rsp_tenants_v1`**:
   Stores the array of all registered business accounts, their business type, admin credentials, custom feature flags, and isolated storage keys.
2. **`rsp_store_<tenant_key>`** (e.g., `rsp_store_v1`, `rsp_store_tenant_174000000`):
   Each business tenant has its own completely isolated JSON document containing:
   * `medicines`: Array of medicine records with batch, stock, MRP, expiry, GST.
   * `customers`: Customer records, phone numbers, addresses, and loan balance.
   * `suppliers`: Supplier directory and ledger balances.
   * `employees`: Staff members, roles, salaries, and login credentials.
   * `sales`: Invoices, line items, payment modes, cashiers, timestamps, and status.
   * `purchases`: Supplier purchase orders and inward invoices.
   * `held`: Suspended / on-hold counter bills.
   * `financeEntries`: Income and operational expense ledger.
   * `attendance`: Employee daily duty records (Full 1.0, Half 0.5, Absent 0.0).
   * `salaryPayments`: Monthly payroll disbursement records.
   * `loans`: Customer loan issuance and repayment transaction logs.
   * `gstProfile`: Official GST registration details (GSTIN, PAN, Address, State Code).
   * `customCategories`: Custom income and expense category tags.
   * `printer`: Thermal paper size (58mm/80mm/A4), store header, footer, copies, auto-print.
   * `audit`: Chronological event trail (up to 500 audit records per tenant).
3. **`rsp_auth_user`**:
   Stores the current active user session (User ID, Role, Store Name, Tenant ID).

#### Cloud Sync Ready (Supabase Integration)
* File: `src/lib/supabase.ts`
* A Supabase client is initialized with credentials. The store schema has been intentionally designed to map 1:1 with standard relational PostgreSQL tables, allowing seamless cloud database migration or background sync.

---

## 🏢 Multi-Tenant Architecture & Business Verticals

The system includes a **Super Admin Tenant Management Engine** (`src/lib/tenant.ts` & `src/routes/superadmin.tsx`) enabling a single software installation to host multiple independent business clients.

### Supported Business Verticals
1. **Medical / Pharmacy (`Medical`):** Full batch management, expiry date monitoring, FEFO deduction, GST calculation, doctor referral field, low-stock warnings.
2. **Hotel / Restaurant (`Hotel`):** Quick food item billing, table counter checkout, customer details bypassed for rapid turnaround.
3. **Supermarket / Grocery (`Supermarket`):** Fast barcode scanning, itemized inventory, volume sales tracking.
4. **Automobile Garage (`Garage`):** Spare parts inventory, service charges, mechanic labor billing.

### Feature Flags Engine
Every tenant account can have individual features enabled or disabled on demand:
* **Modules:** `dashboard`, `billing`, `sales`, `purchase`, `inventory`, `medicines`, `customers`, `suppliers`, `employees`, `reports`, `gst`, `accounts`, `audit`, `barcode`, `qr`, `help`, `settings`, `backup`.
* **Behavioral Switches:** `lowStockAlerts`, `expiryTracking`, `batchTracking`, `customerCapture`, `doctorField`, `helpAssistant`.

---

## 🔐 Role-Based Access Control (RBAC)

The system enforces strict permission scoping across four operational roles defined in `src/lib/auth.ts`:

| Permission / Action | Admin | Manager | Pharmacist | Cashier |
| :--- | :---: | :---: | :---: | :---: |
| **Create Bills (POS Counter)** | ✅ | ✅ | ✅ | ✅ |
| **View Sales & Invoices** | ✅ | ✅ | ✅ | ✅ |
| **Cancel Completed Bills** | ✅ | ✅ | ❌ | ❌ |
| **Purchase Inward Entry** | ✅ | ✅ | ✅ | ❌ |
| **Inventory Adjustments** | ✅ | ✅ | ✅ | ❌ |
| **Medicine Catalog Management** | ✅ | ✅ | ✅ | ❌ |
| **Customer & Loan Management** | ✅ | ✅ | ✅ | ✅ |
| **Supplier Directory** | ✅ | ✅ | ❌ | ❌ |
| **Staff & Payroll Management** | ✅ | ❌ | ❌ | ❌ |
| **GST Reports & Tax Breakup** | ✅ | ✅ | ❌ | ❌ |
| **Income & Expense Ledger** | ✅ | ✅ | ❌ | ❌ |
| **System Settings & Backup** | ✅ | ❌ | ❌ | ❌ |
| **Audit Log Inspection** | ✅ | ✅ | ❌ | ❌ |

---

## 📦 Module-by-Module Feature Breakdown

### 1. POS Counter & Fast Billing (`/_app/`)
* **Live Search & Auto-Suggest:** Search by medicine brand name, generic formulation, batch number, or product code.
* **Barcode & QR Reader:** Camera and physical USB scanner support for instant line item addition.
* **FEFO Stock Deduction:** Automatically deducts from the earliest-expiring batch first.
* **Split Payments:** Split bills across Cash and UPI / Online modes simultaneously.
* **Customer Loyalty Program:** Automatically calculates customer historical spend and applies tiered loyalty discounts (Bronze 5%, Silver 7%, Gold 10%).
* **Bill Hold & Resume:** Suspend multi-item bills while customer chooses additional items; resume anytime.
* **Thermal & A4 Printing:** One-click receipt generation formatted for 58mm/80mm POS thermal printers or standard A4 sheets.
* **Customer Loan Alert:** Displays warning banner when a customer with an existing unpaid balance is selected.

### 2. Executive Dashboard (`/_app/dashboard`)
* Live KPI widgets: Today's Sales, Today's Invoices, Purchase Total, Estimated Net Profit, Total Stock Units, Low Stock Alert Count, Expiring/Expired Item Count, and Daily Customer Count.
* Recent transaction table and fast-action shortcut buttons.

### 3. Comprehensive 9-Tab GST Module (`/_app/gst`)
* **Dashboard Tab:** High-level monthly overview: Taxable Sales, Output CGST, Output SGST, Input Tax Credit (ITC), and Net GST Payable.
* **Sales GST Report:** Itemized tax breakdown per sales invoice.
* **Purchase GST (ITC) Report:** Tax breakdown on inward supplier invoices.
* **Tax Breakup Tab:** Slabs categorization (0%, 5%, 12%, 18%, 28%).
* **HSN/SAC-wise Report:** Quantity and taxable value grouped by HSN/GST rates.
* **Customer-wise GST Report:** Total tax collected per customer profile.
* **Supplier-wise GST Report:** ITC accrued per supplier.
* **ITC Utilization Summary:** Direct comparison of Output Tax vs Input Tax Credit.
* **GST Business Profile:** Editable store GSTIN, PAN, State Code, and Registration Type (Regular/Composition).
* **Export Engine:** One-click CSV downloads for every report tab and print-optimized PDF outputs.

### 4. Customer Loans & Credit Management (`/_app/loans`)
* **Issue Loan:** Issue medicine credits to trusted customers with custom notes and repayment dates.
* **Record Repayment:** Accept partial or full loan repayments with instant customer balance deduction.
* **Trust Customers Overview:** Dedicated cards highlighting customers with outstanding balances.
* **Full Audit History:** Chronological ledger of all credit issuances and repayments.

### 5. Staff, Attendance & Payroll (`/_app/employees`)
* **Directory Tab:** Staff records, role assignment, salary structure, login password resets, and individual sales revenue tracking.
* **Attendance Register Tab:** Mark daily attendance with Full Duty (1.0), Half Duty (0.5), or Absent (0.0), plus daily task counts and monthly calendar logs.
* **Salary & Payroll Tab:** Auto-calculates monthly payable salary using pro-rated attendance days: `(Base Salary / 26) × Duty Days`.
* **Printable Salary Slip:** Dialog with formal company header, attendance breakdown, daily rate, earnings, deductions, payment status, and browser print trigger.

### 6. Income & Expense Management (`/_app/accounts`)
* Record revenue streams and operational business expenses (Rent, Salaries, Utilities, Supplies, Equipment).
* **Custom Categories:** Ability to add new custom categories inline directly from the category selector.
* Monthly summaries displaying Total Income, Total Expenses, Net Profit/Loss, and Transaction Counts.

### 7. Inventory & Stock Management (`/_app/inventory` & `/_app/medicines`)
* Stock tracking by batch and expiry date.
* Visual indicators for Low Stock (< 20 units) and Expiring Soon (< 180 days).
* Manual stock adjustment with mandatory reason logging for audit compliance.
* Bulk import via Excel sheets (.xlsx, .xls, .csv) with column auto-mapping.
* **AI Camera Photo OCR:** Upload a picture of a stockist invoice to automatically extract tabular product data via AI vision server functions.

### 8. Barcode & Label Generation (`/_app/barcode`)
* Generates standard **Code 128** barcodes in real-time.
* Custom label print sheet generator formatted for standard 24-label and 65-label sticker sheets.

### 9. UPI QR & Digital Payments (`/_app/qr`)
* Dynamic UPI QR code generator configured with the store's UPI VPA handle and invoice amounts.
* Medicine verification QR code generator.

### 10. Audit Trail & Data Safety (`/_app/audit` & `/_app/backup`)
* **Audit Trail:** Immutable record of all logins, bill creations, cancellations, stock edits, and staff modifications.
* **Backup & Restore:** Full JSON database export to local disk and instant one-click restoration.

---

## 🧮 Core Business Logic & Algorithms

### 1. FEFO (First-Expiry-First-Out) Deduction Algorithm
When a sale is confirmed, items are not deducted randomly. The store searches all existing batches of the same product name with available stock and sorts them by expiry date ascending (`a.expiry.localeCompare(b.expiry)`). Deductions occur sequentially from the batch closest to expiring.

### 2. Bill Calculation Pipeline
$$\text{Line Subtotal} = \text{MRP} \times \text{Qty}$$
$$\text{Line Discount} = \text{Line Subtotal} \times \left(\frac{\text{Discount \%}}{100}\right)$$
$$\text{Taxable Value} = \text{Line Subtotal} - \text{Line Discount}$$
$$\text{GST Amount} = \text{Taxable Value} \times \left(\frac{\text{GST \%}}{100}\right)$$
$$\text{CGST} = \frac{\text{GST Amount}}{2}, \quad \text{SGST} = \frac{\text{GST Amount}}{2}$$
$$\text{Grand Total} = \text{Round}\left(\sum \text{Taxable Value} + \sum \text{GST Amount}\right)$$

### 3. Pro-Rated Salary Calculation
$$\text{Daily Wage Rate} = \frac{\text{Monthly Base Salary}}{26}$$
$$\text{Duty Days} = \sum \text{Full Days (1.0)} + \sum \text{Half Days (0.5)}$$
$$\text{Net Payable} = \text{Round}(\text{Daily Wage Rate} \times \text{Duty Days})$$

---

## 🖨️ Hardware & Peripheral Integrations

* **Thermal POS Printers:** Supports 58mm (2-inch) and 80mm (3-inch) ESC/POS standard widths with automatic CSS page constraints (`@media print`).
* **Laser / Inkjet Printers:** Formatted for full A4 invoices with itemized tax columns and company letterhead.
* **Barcode Scanners:** Compatible with standard USB HID barcode scanners (emulates keyboard entry + Enter key) and mobile camera video feeds.
* **Cash Drawers:** Compatible with standard RJ11/RJ12 drawer kick signals linked to thermal printer drivers.

---

## ⚙️ Configuration & Environment Setup

### Environment Variables (`.env`)
Create a `.env` file in the root directory if using AI vision photo imports or Supabase cloud sync:

```env
# AI Vision OCR Feature (Optional - for photo-based stockist bill import)
AI_API_KEY="your-openai-or-gemini-api-key"
AI_GATEWAY_URL="https://api.openai.com/v1/chat/completions"

# Supabase Cloud Sync (Optional)
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

---

## 🚀 Running & Building the Application

### 1. Prerequisites
* **Node.js**: Version 20.x or 22.x LTS installed
* **Package Manager**: npm, pnpm, or bun

### 2. Installation
```bash
# Clone the repository
git clone <repository-url>
cd "Medical billing software"

# Install all dependencies
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open your browser and navigate to **`http://localhost:5173`** (or the port displayed in your terminal).

### 4. Default Demo Credentials
* **Main Admin (ANAM Medical Store):**
  * **Phone / User ID:** `9876543210` (or `manjju@anam.com`)
  * **Password:** `anam@2026`
* **Super Admin Portal:** Navigate to `/superadmin` to manage multi-tenant accounts.

### 5. Production Build
```bash
# Generate production client & Nitro server bundles
npm run build

# Preview production build locally
npm run preview
```

### 6. Linting & Formatting
```bash
# Run ESLint validation
npm run lint

# Format code with Prettier
npm run format
```

---

## 📄 License & Attribution

* **Software:** RSP Medical Billing & Multi-Tenant Retail ERP System
* **Client:** ANAM Medical Store, Hindupur
* **Engineering:** RSP Softwares (All Rights Reserved)
