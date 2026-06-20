CREATE OR REPLACE FUNCTION public.fn_reset_transactions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
BEGIN
  -- Verify caller is owner
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: HANYA OWNER YANG BISA MERESET TRANSAKSI';
  END IF;

  -- Disable triggers temporarily
  ALTER TABLE public.expenses DISABLE TRIGGER trg_expenses_time_limit;
  ALTER TABLE public.incomes DISABLE TRIGGER trg_incomes_time_limit;

  -- Delete data
  DELETE FROM public.transaction_items;
  DELETE FROM public.transactions;
  DELETE FROM public.stock_movements;
  DELETE FROM public.restocks;
  DELETE FROM public.cash_drawer_logs;
  DELETE FROM public.expenses;
  DELETE FROM public.incomes;

  -- Reset stock
  UPDATE public.product_stock SET quantity = 0;

  -- Re-enable triggers
  ALTER TABLE public.expenses ENABLE TRIGGER trg_expenses_time_limit;
  ALTER TABLE public.incomes ENABLE TRIGGER trg_incomes_time_limit;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  -- Re-enable triggers just in case it failed midway
  ALTER TABLE public.expenses ENABLE TRIGGER trg_expenses_time_limit;
  ALTER TABLE public.incomes ENABLE TRIGGER trg_incomes_time_limit;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
