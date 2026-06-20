-- Migration: 00000000000012_ssot_omzet.sql
-- Description: Consolidate omset calculation to use fn_get_dashboard_summary as SSOT

-- 1. Modify fn_get_profit_loss to use fn_get_dashboard_summary
CREATE OR REPLACE FUNCTION public.fn_get_profit_loss(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_summary jsonb;
  v_total_omzet numeric;
  v_total_cogs numeric;
  v_gross_profit numeric;
  v_total_expenses numeric;
  v_other_incomes numeric;
  v_net_profit numeric;
  v_caller_id uuid := auth.uid();
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: ONLY_OWNER';
  END IF;

  -- 1. Get Revenue & COGS from Single Source of Truth (fn_get_dashboard_summary)
  -- Note: p_cashier_id is passed as NULL so it aggregates across the whole branch
  v_summary := public.fn_get_dashboard_summary(p_branch_id, p_start_date, p_end_date, NULL);
  
  v_total_omzet := COALESCE((v_summary->>'total_omzet')::numeric, 0);
  v_total_cogs := COALESCE((v_summary->>'total_cogs')::numeric, 0);

  v_gross_profit := v_total_omzet - v_total_cogs;

  -- 2. Expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
  FROM public.expenses
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  -- 3. Incomes (Other incomes)
  SELECT COALESCE(SUM(amount), 0) INTO v_other_incomes
  FROM public.incomes
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  v_net_profit := v_gross_profit - v_total_expenses + v_other_incomes;

  -- Return fields matching exactly what frontend expects
  RETURN jsonb_build_object(
    'total_omzet', v_total_omzet,
    'total_cogs', v_total_cogs,
    'gross_profit', v_gross_profit,
    'total_expenses', v_total_expenses,
    'total_incomes', v_other_incomes,
    'net_profit', v_net_profit
  );
END;
$$;


-- 2. Restore fn_get_top_products with proper timezone fix, p_sort_by, and correct UI field names
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
  v_result jsonb;
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_caller_branch uuid;
BEGIN
  SELECT role, branch_id INTO v_caller_role, v_caller_branch FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role != 'owner' THEN
    IF p_branch_id IS NULL OR p_branch_id != v_caller_branch THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)), '[]'::jsonb)
  INTO v_result
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
      AND t.created_at >= (p_start_date::text || ' 00:00:00+07')::timestamptz
      AND t.created_at < ((p_end_date + interval '1 day')::date::text || ' 00:00:00+07')::timestamptz
    GROUP BY p.id, p.name
    ORDER BY 
      CASE WHEN p_sort_by = 'omzet' THEN SUM(ti.subtotal) ELSE SUM(ti.quantity * ti.conversion_to_base_snapshot) END DESC
    LIMIT p_limit
  ) sub;

  RETURN v_result;
END;
$$;
