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

  -- Delete data with WHERE clause to bypass pg_safeupdate
  DELETE FROM public.transaction_items WHERE true;
  DELETE FROM public.transactions WHERE true;
  DELETE FROM public.stock_movements WHERE true;
  DELETE FROM public.restocks WHERE true;
  DELETE FROM public.cash_drawer_logs WHERE true;
  DELETE FROM public.expenses WHERE true;
  DELETE FROM public.incomes WHERE true;

  -- Reset stock with WHERE clause to bypass pg_safeupdate
  UPDATE public.product_stock SET quantity = 0 WHERE true;

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
