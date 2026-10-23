-- ==============================================================================
-- RSP MediBill — Rack Management & Smart Storage Configuration Migration
-- Migration: 20261023_storage_management.sql
-- Description:
--   1. Creates `public.storage_rules` for multi-type, filter-based rack & box rules.
--   2. Creates `public.storage_settings` for shop-level global defaults.
--   3. Creates `public.storage_movements` for stock relocation history.
--   4. Adds performance indexes and Row Level Security (RLS) policies.
-- ==============================================================================

-- Step 1: Storage Rules Table
CREATE TABLE IF NOT EXISTS public.storage_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  storage_mode TEXT NOT NULL DEFAULT 'box_wise', -- 'box_wise' or 'rack_only'
  
  -- Filter criteria
  medicine_types JSONB NOT NULL DEFAULT '["ALL"]'::jsonb,
  companies JSONB NOT NULL DEFAULT '["ALL"]'::jsonb,
  manufacturers JSONB NOT NULL DEFAULT '["ALL"]'::jsonb,
  categories JSONB NOT NULL DEFAULT '["ALL"]'::jsonb,
  classification TEXT NOT NULL DEFAULT 'all', -- 'all', 'branded', 'generic'
  
  -- Rack configuration
  rack_prefix TEXT NOT NULL DEFAULT 'R',
  starting_rack_number INTEGER NOT NULL DEFAULT 1,
  rack_count INTEGER NOT NULL DEFAULT 5,
  allow_additional_racks BOOLEAN NOT NULL DEFAULT TRUE,
  rack_pad INTEGER NOT NULL DEFAULT 2,
  
  -- Box configuration (used when storage_mode = 'box_wise')
  box_prefix TEXT NOT NULL DEFAULT 'B',
  box_pad INTEGER NOT NULL DEFAULT 3,
  usable_boxes_per_rack INTEGER NOT NULL DEFAULT 20,
  
  -- Capacity configuration
  capacity_mode TEXT NOT NULL DEFAULT 'items_count',
  capacity_limit INTEGER NOT NULL DEFAULT 1,
  
  -- Reserved empty position configuration
  reserved_positions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reserved_positions_per_rack INTEGER NOT NULL DEFAULT 1,
  reserved_placement TEXT NOT NULL DEFAULT 'end', -- 'end' or 'beginning'
  
  -- Automation & Override
  auto_assignment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manual_override_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Storage Settings Table (Global Shop Defaults)
CREATE TABLE IF NOT EXISTS public.storage_settings (
  tenant_id TEXT PRIMARY KEY,
  auto_assignment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rack_count INTEGER NOT NULL DEFAULT 5 CHECK (rack_count > 0),
  usable_boxes_per_rack INTEGER NOT NULL DEFAULT 20 CHECK (usable_boxes_per_rack > 0),
  reserved_positions_per_rack INTEGER NOT NULL DEFAULT 1 CHECK (reserved_positions_per_rack >= 0),
  rack_prefix TEXT NOT NULL DEFAULT 'R',
  box_prefix TEXT NOT NULL DEFAULT 'B',
  rack_pad INTEGER NOT NULL DEFAULT 2,
  box_pad INTEGER NOT NULL DEFAULT 3,
  numbering_strategy TEXT NOT NULL DEFAULT 'rack_box',
  capacity_mode TEXT NOT NULL DEFAULT 'items_count',
  capacity_per_box INTEGER NOT NULL DEFAULT 1 CHECK (capacity_per_box >= 0),
  medicine_type_rule TEXT NOT NULL DEFAULT 'tablets_only',
  applicable_medicine_types JSONB NOT NULL DEFAULT '["Tablet", "Tablets", "TAB", "Tabs"]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Storage Stock Movement History Table
CREATE TABLE IF NOT EXISTS public.storage_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  medicine_name TEXT NOT NULL,
  batch TEXT,
  from_rack TEXT,
  from_box TEXT,
  to_rack TEXT NOT NULL,
  to_box TEXT,
  quantity NUMERIC DEFAULT 0,
  moved_by TEXT DEFAULT 'Staff',
  reason TEXT DEFAULT 'Storage reorganization',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: Indexes
CREATE INDEX IF NOT EXISTS idx_storage_rules_tenant ON public.storage_rules (tenant_id, priority ASC);
CREATE INDEX IF NOT EXISTS idx_storage_settings_tenant ON public.storage_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_storage_movements_tenant ON public.storage_movements (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_movements_med ON public.storage_movements (tenant_id, medicine_id);

-- Step 5: Enable Row Level Security (RLS)
ALTER TABLE public.storage_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_movements ENABLE ROW LEVEL SECURITY;

-- Step 6: Permissive Access Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'storage_rules' AND policyname = 'Allow all access to storage_rules'
  ) THEN
    CREATE POLICY "Allow all access to storage_rules" ON public.storage_rules
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'storage_settings' AND policyname = 'Allow all access to storage_settings'
  ) THEN
    CREATE POLICY "Allow all access to storage_settings" ON public.storage_settings
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'storage_movements' AND policyname = 'Allow all access to storage_movements'
  ) THEN
    CREATE POLICY "Allow all access to storage_movements" ON public.storage_movements
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Step 7: Grant Table Permissions
GRANT ALL ON TABLE public.storage_rules TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.storage_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.storage_movements TO anon, authenticated, service_role;
