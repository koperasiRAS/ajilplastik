-- Perbaikan field JSON pada fn_get_profit_loss agar sesuai dengan Frontend Laporan

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

  -- Expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
  FROM public.expenses
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  -- Incomes (Other incomes)
  SELECT COALESCE(SUM(amount), 0) INTO v_other_incomes
  FROM public.incomes
  WHERE (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND date >= p_start_date
    AND date <= p_end_date;

  v_net_profit := v_gross_profit - v_total_expenses + v_other_incomes;

  -- Return fields matching exactly what frontend expects (total_omzet, total_incomes)
  RETURN jsonb_build_object(
    'total_omzet', v_total_revenue,
    'total_cogs', v_total_cogs,
    'gross_profit', v_gross_profit,
    'total_expenses', v_total_expenses,
    'total_incomes', v_other_incomes,
    'net_profit', v_net_profit
  );
END;
$$;
