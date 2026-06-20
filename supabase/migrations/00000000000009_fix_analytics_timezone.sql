-- Fix Timezone issue for Analytics & Dashboard RPCs
-- This ensures that the boundary dates sent by the frontend (WIB / Asia/Jakarta)
-- are evaluated correctly against the UTC created_at timestamp.

-- 1. fn_get_dashboard_summary
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
    AND t.created_at >= (p_start_date::text || ' 00:00:00+07')::timestamptz
    AND t.created_at < ((p_end_date + interval '1 day')::date::text || ' 00:00:00+07')::timestamptz;

  -- Total COGS (Modal)
  SELECT COALESCE(SUM(ti.quantity * ti.buy_price_snapshot), 0)
  INTO v_total_cogs
  FROM public.transaction_items ti
  JOIN public.transactions t ON t.id = ti.transaction_id
  WHERE t.status = 'completed'
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    AND (p_cashier_id IS NULL OR t.cashier_id = p_cashier_id)
    AND t.created_at >= (p_start_date::text || ' 00:00:00+07')::timestamptz
    AND t.created_at < ((p_end_date + interval '1 day')::date::text || ' 00:00:00+07')::timestamptz;

  -- Daily Trend
  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', tx_date, 'omzet', daily_omzet)), '[]'::jsonb)
  INTO v_daily_trend
  FROM (
    SELECT (t.created_at AT TIME ZONE 'Asia/Jakarta')::date as tx_date, SUM(t.total_amount) as daily_omzet
    FROM public.transactions t
    WHERE t.status = 'completed'
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
      AND (p_cashier_id IS NULL OR t.cashier_id = p_cashier_id)
      AND t.created_at >= (p_start_date::text || ' 00:00:00+07')::timestamptz
      AND t.created_at < ((p_end_date + interval '1 day')::date::text || ' 00:00:00+07')::timestamptz
    GROUP BY (t.created_at AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY (t.created_at AT TIME ZONE 'Asia/Jakarta')::date
  ) sub;

  RETURN jsonb_build_object(
    'total_omzet', v_total_omzet,
    'total_cogs', v_total_cogs,
    'transaction_count', v_transaction_count,
    'daily_trend', v_daily_trend
  );
END;
$$;


-- 2. fn_get_top_products
CREATE OR REPLACE FUNCTION public.fn_get_top_products(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_limit integer DEFAULT 5
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

  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT 
      ti.product_name as name,
      SUM(ti.quantity) as total_sold,
      SUM(ti.subtotal) as total_revenue
    FROM public.transaction_items ti
    JOIN public.transactions t ON t.id = ti.transaction_id
    WHERE t.status = 'completed'
      AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
      AND t.created_at >= (p_start_date::text || ' 00:00:00+07')::timestamptz
      AND t.created_at < ((p_end_date + interval '1 day')::date::text || ' 00:00:00+07')::timestamptz
    GROUP BY ti.product_id, ti.product_name
    ORDER BY total_sold DESC
    LIMIT p_limit
  ) sub;

  RETURN v_result;
END;
$$;


-- 3. fn_get_profit_loss
CREATE OR REPLACE FUNCTION public.fn_get_profit_loss(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_revenue numeric;
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

  -- Revenue & COGS from Transactions
  SELECT 
    COALESCE(SUM(t.total_amount), 0),
    COALESCE(SUM(ti.total_cogs), 0)
  INTO v_total_revenue, v_total_cogs
  FROM public.transactions t
  LEFT JOIN (
    SELECT transaction_id, SUM(quantity * buy_price_snapshot) as total_cogs 
    FROM public.transaction_items 
    GROUP BY transaction_id
  ) ti ON t.id = ti.transaction_id
  WHERE t.status = 'completed'
    AND (p_branch_id IS NULL OR t.branch_id = p_branch_id)
    AND t.created_at >= (p_start_date::text || ' 00:00:00+07')::timestamptz
    AND t.created_at < ((p_end_date + interval '1 day')::date::text || ' 00:00:00+07')::timestamptz;

  v_gross_profit := v_total_revenue - v_total_cogs;

  -- Total Expenses
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_expenses
  FROM public.expenses
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  -- Other Incomes
  SELECT COALESCE(SUM(amount), 0)
  INTO v_other_incomes
  FROM public.incomes
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  v_net_profit := v_gross_profit + v_other_incomes - v_total_expenses;

  RETURN jsonb_build_object(
    'total_revenue', v_total_revenue,
    'total_cogs', v_total_cogs,
    'gross_profit', v_gross_profit,
    'total_expenses', v_total_expenses,
    'other_incomes', v_other_incomes,
    'net_profit', v_net_profit
  );
END;
$$;
