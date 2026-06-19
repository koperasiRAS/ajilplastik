-- Migration: Hardening Phase 8 (Security Definer & Subtotal Validation)

-- 1. Hardening: fn_checkout_pos
CREATE OR REPLACE FUNCTION public.fn_checkout_pos(
  p_branch_id uuid,
  p_cashier_id uuid,
  p_payment_method public.payment_method_type,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_items jsonb -- Array of objects: {product_id, product_unit_id, unit_name_snapshot, conversion_to_base_snapshot, quantity, price_snapshot, buy_price_snapshot, subtotal}
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction_id uuid;
  v_transaction_number text;
  v_item jsonb;
  v_stock_record public.product_stock%ROWTYPE;
  v_calculated_total numeric := 0;
  v_stock_needed integer;
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_branch uuid;
  v_item_subtotal numeric;
BEGIN
  -- 0. Auth Validation
  SELECT role, branch_id INTO v_caller_role, v_caller_branch FROM public.profiles WHERE id = v_caller_id;
  
  IF v_caller_role != 'owner' THEN
    IF p_branch_id != v_caller_branch THEN
      RAISE EXCEPTION 'UNAUTHORIZED: AKSES_CABANG_DITOLAK';
    END IF;
    IF p_cashier_id != v_caller_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: IDENTITAS_KASIR_TIDAK_SESUAI';
    END IF;
  END IF;

  -- Validate empty cart
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'KERANJANG_KOSONG';
  END IF;

  -- 1. Validate total amount and recalculate subtotal
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'quantity')::integer <= 0 THEN
      RAISE EXCEPTION 'KUANTITAS_TIDAK_VALID';
    END IF;
    
    -- Backend calculation for subtotal
    v_item_subtotal := (v_item->>'quantity')::integer * (v_item->>'price_snapshot')::numeric;
    v_calculated_total := v_calculated_total + v_item_subtotal;
  END LOOP;

  IF v_calculated_total - p_discount_amount != p_total_amount THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH';
  END IF;

  -- Generate transaction number
  v_transaction_number := 'TRX-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD-HHMISS') || '-' || upper(substr(md5(random()::text), 1, 4));

  -- 2. Insert transaction
  INSERT INTO public.transactions (
    transaction_number, branch_id, cashier_id, payment_method, 
    status, total_amount, discount_amount
  ) VALUES (
    v_transaction_number, p_branch_id, p_cashier_id, p_payment_method, 
    'completed', p_total_amount, p_discount_amount
  ) RETURNING id INTO v_transaction_id;

  -- 3. Process items & stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_needed := (v_item->>'quantity')::integer * (v_item->>'conversion_to_base_snapshot')::integer;
    v_item_subtotal := (v_item->>'quantity')::integer * (v_item->>'price_snapshot')::numeric;

    -- Lock the stock row for update to prevent race conditions
    SELECT * INTO v_stock_record 
    FROM public.product_stock 
    WHERE branch_id = p_branch_id AND product_id = (v_item->>'product_id')::uuid 
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'STOK_TIDAK_DITEMUKAN: %', (v_item->>'product_id')::text;
    END IF;

    IF v_stock_record.quantity < v_stock_needed THEN
      RAISE EXCEPTION 'STOK_TIDAK_CUKUP: %', (v_item->>'product_id')::text;
    END IF;

    -- Deduct stock
    UPDATE public.product_stock
    SET quantity = quantity - v_stock_needed,
        updated_at = now()
    WHERE id = v_stock_record.id;

    -- Insert stock movement
    INSERT INTO public.stock_movements (
      branch_id, product_id, type, quantity_change, reference_id, created_by
    ) VALUES (
      p_branch_id, (v_item->>'product_id')::uuid, 'sale', -v_stock_needed, v_transaction_id, p_cashier_id
    );

    -- Insert transaction item WITH buy_price_snapshot
    INSERT INTO public.transaction_items (
      transaction_id, product_id, product_unit_id, unit_name_snapshot,
      conversion_to_base_snapshot, quantity, price_snapshot, buy_price_snapshot, subtotal
    ) VALUES (
      v_transaction_id, (v_item->>'product_id')::uuid, (v_item->>'product_unit_id')::uuid, 
      v_item->>'unit_name_snapshot', (v_item->>'conversion_to_base_snapshot')::integer, 
      (v_item->>'quantity')::integer, (v_item->>'price_snapshot')::numeric, 
      COALESCE((v_item->>'buy_price_snapshot')::numeric, 0),
      v_item_subtotal
    );

  END LOOP;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'transaction_number', v_transaction_number);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 2. Hardening: fn_get_dashboard_summary
CREATE OR REPLACE FUNCTION public.fn_get_dashboard_summary(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_cashier_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_omzet numeric;
  v_total_cogs numeric;
  v_transaction_count integer;
  v_daily_trend jsonb;
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_branch uuid;
BEGIN
  -- Auth Validation
  SELECT role, branch_id INTO v_caller_role, v_caller_branch FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role != 'owner' THEN
    IF p_branch_id IS NULL OR p_branch_id != v_caller_branch THEN
      RAISE EXCEPTION 'UNAUTHORIZED: AKSES_CABANG_DITOLAK';
    END IF;
  END IF;

  -- Total Omzet & Count
  SELECT 
    COALESCE(SUM(t.total_amount), 0),
    COUNT(t.id)
  INTO v_total_omzet, v_transaction_count
  FROM public.transactions t
  WHERE t.status = 'completed'
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    AND (p_cashier_id IS NULL OR t.cashier_id = p_cashier_id)
    AND t.created_at >= p_start_date::timestamp
    AND t.created_at < (p_end_date + interval '1 day')::timestamp;

  -- Total COGS (Modal)
  SELECT COALESCE(SUM(ti.quantity * ti.buy_price_snapshot), 0)
  INTO v_total_cogs
  FROM public.transaction_items ti
  JOIN public.transactions t ON t.id = ti.transaction_id
  WHERE t.status = 'completed'
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    AND (p_cashier_id IS NULL OR t.cashier_id = p_cashier_id)
    AND t.created_at >= p_start_date::timestamp
    AND t.created_at < (p_end_date + interval '1 day')::timestamp;

  -- Daily Trend
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', tx_date, 'omzet', daily_omzet)), '[]'::jsonb)
  INTO v_daily_trend
  FROM (
    SELECT t.created_at::date as tx_date, SUM(t.total_amount) as daily_omzet
    FROM public.transactions t
    WHERE t.status = 'completed'
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR t.cashier_id = p_cashier_id)
      AND t.created_at >= p_start_date::timestamp
      AND t.created_at < (p_end_date + interval '1 day')::timestamp
    GROUP BY t.created_at::date
    ORDER BY t.created_at::date
  ) sub;

  RETURN jsonb_build_object(
    'total_omzet', v_total_omzet,
    'total_cogs', v_total_cogs,
    'transaction_count', v_transaction_count,
    'daily_trend', v_daily_trend
  );
END;
$$;


-- 3. Hardening: fn_get_top_products
CREATE OR REPLACE FUNCTION public.fn_get_top_products(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit integer DEFAULT 5,
  p_sort_by text DEFAULT 'quantity' -- 'quantity' or 'omzet'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_branch uuid;
  v_result jsonb;
BEGIN
  -- Auth Validation
  SELECT role, branch_id INTO v_caller_role, v_caller_branch FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role != 'owner' THEN
    IF p_branch_id IS NULL OR p_branch_id != v_caller_branch THEN
      RAISE EXCEPTION 'UNAUTHORIZED: AKSES_CABANG_DITOLAK';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT 
      p.id as product_id,
      p.name as product_name,
      SUM(ti.quantity * ti.conversion_to_base_snapshot) as total_quantity_base,
      SUM(ti.subtotal) as total_omzet
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    JOIN public.products p ON p.id = ti.product_id
    WHERE t.status = 'completed'
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
      AND t.created_at >= p_start_date::timestamp
      AND t.created_at < (p_end_date + interval '1 day')::timestamp
    GROUP BY p.id, p.name
    ORDER BY 
      CASE WHEN p_sort_by = 'omzet' THEN SUM(ti.subtotal) ELSE SUM(ti.quantity * ti.conversion_to_base_snapshot) END DESC
    LIMIT p_limit
  ) sub;

  RETURN v_result;
END;
$$;


-- 4. Hardening: fn_get_profit_loss
CREATE OR REPLACE FUNCTION public.fn_get_profit_loss(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_omzet numeric;
  v_total_cogs numeric;
  v_total_expenses numeric;
  v_total_incomes numeric;
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_branch uuid;
BEGIN
  -- Auth Validation
  SELECT role, branch_id INTO v_caller_role, v_caller_branch FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role != 'owner' THEN
    IF p_branch_id IS NULL OR p_branch_id != v_caller_branch THEN
      RAISE EXCEPTION 'UNAUTHORIZED: AKSES_CABANG_DITOLAK';
    END IF;
  END IF;

  -- Sales & COGS
  SELECT 
    COALESCE(SUM(t.total_amount), 0),
    COALESCE(SUM(
      (SELECT COALESCE(SUM(ti.quantity * ti.buy_price_snapshot), 0) FROM public.transaction_items ti WHERE ti.transaction_id = t.id)
    ), 0)
  INTO v_total_omzet, v_total_cogs
  FROM public.transactions t
  WHERE t.status = 'completed'
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    AND t.created_at >= p_start_date::timestamp
    AND t.created_at < (p_end_date + interval '1 day')::timestamp;

  -- Expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
  FROM public.expenses
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  -- Incomes (Other incomes)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_incomes
  FROM public.incomes
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  RETURN jsonb_build_object(
    'total_omzet', v_total_omzet,
    'total_cogs', v_total_cogs,
    'gross_profit', v_total_omzet - v_total_cogs,
    'total_expenses', v_total_expenses,
    'total_incomes', v_total_incomes,
    'net_profit', (v_total_omzet - v_total_cogs) - v_total_expenses + v_total_incomes
  );
END;
$$;
