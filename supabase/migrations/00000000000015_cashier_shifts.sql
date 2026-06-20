-- Migration: Cashier Shifts Phase 1

-- 1. Create shifts table
CREATE TABLE IF NOT EXISTS public.shifts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id uuid REFERENCES public.branches(id) NOT NULL,
    cashier_id uuid REFERENCES public.profiles(id) NOT NULL,
    opening_balance numeric NOT NULL,
    closing_balance_expected numeric,
    closing_balance_actual numeric,
    difference numeric,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    summary jsonb,
    opened_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for shifts
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shifts viewable by owner or own cashier"
ON public.shifts FOR SELECT
USING (
  auth.uid() = cashier_id OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
);

CREATE POLICY "Shifts insertable by own cashier"
ON public.shifts FOR INSERT
WITH CHECK (
  auth.uid() = cashier_id
);

CREATE POLICY "Shifts updatable by owner or own cashier"
ON public.shifts FOR UPDATE
USING (
  auth.uid() = cashier_id OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner'
);

-- 2. Modify transactions table
ALTER TABLE public.transactions
ADD COLUMN shift_id uuid REFERENCES public.shifts(id);

-- 3. Create fn_open_shift
CREATE OR REPLACE FUNCTION public.fn_open_shift(
  p_branch_id uuid,
  p_opening_balance numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_shift_id uuid;
BEGIN
  -- Cek apakah kasir sudah punya shift open
  IF EXISTS (
    SELECT 1 FROM public.shifts 
    WHERE cashier_id = v_caller_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_OPEN: Anda masih memiliki shift yang sedang berjalan. Harap tutup shift tersebut terlebih dahulu.';
  END IF;

  INSERT INTO public.shifts (branch_id, cashier_id, opening_balance, status)
  VALUES (p_branch_id, v_caller_id, p_opening_balance, 'open')
  RETURNING id INTO v_shift_id;

  RETURN jsonb_build_object('success', true, 'shift_id', v_shift_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. Create fn_close_shift
CREATE OR REPLACE FUNCTION public.fn_close_shift(
  p_shift_id uuid,
  p_closing_balance_actual numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_shift public.shifts%ROWTYPE;
  
  v_total_transactions integer := 0;
  v_total_voids integer := 0;
  
  v_total_cash numeric := 0;
  v_total_transfer numeric := 0;
  v_total_qris numeric := 0;
  
  v_expected numeric := 0;
  v_difference numeric := 0;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND';
  END IF;

  IF v_shift.status = 'closed' THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED';
  END IF;

  IF v_caller_role != 'owner' AND v_shift.cashier_id != v_caller_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Anda tidak dapat menutup shift kasir lain.';
  END IF;

  -- Aggregate completed transactions
  SELECT 
    COUNT(id),
    COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'qris' THEN total_amount ELSE 0 END), 0)
  INTO 
    v_total_transactions, v_total_cash, v_total_transfer, v_total_qris
  FROM public.transactions 
  WHERE shift_id = p_shift_id AND status = 'completed';

  -- Aggregate void transactions
  SELECT COUNT(id) INTO v_total_voids
  FROM public.transactions
  WHERE shift_id = p_shift_id AND status = 'void';

  v_expected := v_shift.opening_balance + v_total_cash;
  v_difference := p_closing_balance_actual - v_expected;

  UPDATE public.shifts
  SET status = 'closed',
      closed_at = now(),
      closing_balance_expected = v_expected,
      closing_balance_actual = p_closing_balance_actual,
      difference = v_difference,
      summary = jsonb_build_object(
        'total_transactions', v_total_transactions,
        'total_voids', v_total_voids,
        'total_cash', v_total_cash,
        'total_transfer', v_total_transfer,
        'total_qris', v_total_qris
      )
  WHERE id = p_shift_id;

  RETURN jsonb_build_object(
    'success', true,
    'expected', v_expected,
    'actual', p_closing_balance_actual,
    'difference', v_difference,
    'summary', jsonb_build_object(
        'total_transactions', v_total_transactions,
        'total_voids', v_total_voids,
        'total_cash', v_total_cash,
        'total_transfer', v_total_transfer,
        'total_qris', v_total_qris
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Modify fn_checkout_pos
CREATE OR REPLACE FUNCTION public.fn_checkout_pos(
  p_branch_id uuid,
  p_cashier_id uuid,
  p_shift_id uuid,
  p_payment_method public.payment_method_type,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_items jsonb
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
BEGIN
  -- 1a. Validate Shift
  IF NOT EXISTS (
    SELECT 1 FROM public.shifts
    WHERE id = p_shift_id
      AND cashier_id = p_cashier_id
      AND branch_id = p_branch_id
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'SHIFT_TIDAK_VALID: Anda harus membuka shift terlebih dahulu atau shift sudah ditutup.';
  END IF;

  -- 1b. Validate total amount
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_calculated_total := v_calculated_total + (v_item->>'subtotal')::numeric;
  END LOOP;

  IF v_calculated_total - p_discount_amount != p_total_amount THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH';
  END IF;

  -- Generate transaction number
  v_transaction_number := 'TRX-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD-HHMISS') || '-' || upper(substr(md5(random()::text), 1, 4));

  -- 2. Insert transaction
  INSERT INTO public.transactions (
    transaction_number, branch_id, cashier_id, shift_id, payment_method, 
    status, total_amount, discount_amount
  ) VALUES (
    v_transaction_number, p_branch_id, p_cashier_id, p_shift_id, p_payment_method, 
    'completed', p_total_amount, p_discount_amount
  ) RETURNING id INTO v_transaction_id;

  -- 3. Process items & stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_needed := (v_item->>'quantity')::integer * (v_item->>'conversion_to_base_snapshot')::integer;

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

    -- Insert transaction item
    INSERT INTO public.transaction_items (
      transaction_id, product_id, product_unit_id, unit_name_snapshot,
      conversion_to_base_snapshot, quantity, price_snapshot, subtotal
    ) VALUES (
      v_transaction_id, (v_item->>'product_id')::uuid, (v_item->>'product_unit_id')::uuid, 
      v_item->>'unit_name_snapshot', (v_item->>'conversion_to_base_snapshot')::integer, 
      (v_item->>'quantity')::integer, (v_item->>'price_snapshot')::numeric, 
      (v_item->>'subtotal')::numeric
    );

  END LOOP;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'transaction_number', v_transaction_number);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. Modify fn_void_transaction
CREATE OR REPLACE FUNCTION public.fn_void_transaction(
  p_transaction_id uuid,
  p_void_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_item public.transaction_items%ROWTYPE;
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_stock_to_return integer;
  v_shift_status text;
BEGIN
  -- Get caller profile
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;

  -- Lock transaction
  SELECT * INTO v_transaction FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRANSAKSI_TIDAK_DITEMUKAN';
  END IF;

  IF v_transaction.status = 'void' THEN
    RAISE EXCEPTION 'TRANSAKSI_SUDAH_VOID';
  END IF;

  -- Validasi Shift: Jika punya shift_id, pastikan shift masih open
  IF v_transaction.shift_id IS NOT NULL THEN
    SELECT status INTO v_shift_status FROM public.shifts WHERE id = v_transaction.shift_id;
    IF v_shift_status = 'closed' THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Transaksi ini terkait dengan shift yang sudah ditutup dan tidak dapat di-void lagi.';
    END IF;
  END IF;

  -- Check authorization: Caller must be owner OR (caller is cashier AND created the transaction AND it's on the same calendar day)
  IF v_caller_role != 'owner' THEN
    IF v_transaction.cashier_id != v_caller_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: BUKAN_TRANSAKSI_ANDA';
    END IF;
    -- Syarat: Kasir hanya bisa void di hari kalender yang sama (WIB)
    IF DATE(now() AT TIME ZONE 'Asia/Jakarta') != DATE(v_transaction.created_at AT TIME ZONE 'Asia/Jakarta') THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Transaksi ini sudah melewati hari berjalan dan tidak bisa di-void lagi. Hubungi Owner untuk koreksi manual.';
    END IF;
  END IF;

  -- Mark transaction as void
  UPDATE public.transactions
  SET status = 'void',
      void_reason = p_void_reason,
      void_by = v_caller_id
  WHERE id = p_transaction_id;

  -- Return stock and create movements
  FOR v_item IN SELECT * FROM public.transaction_items WHERE transaction_id = p_transaction_id
  LOOP
    v_stock_to_return := v_item.quantity * v_item.conversion_to_base_snapshot;

    -- Add stock back
    UPDATE public.product_stock
    SET quantity = quantity + v_stock_to_return,
        updated_at = now()
    WHERE branch_id = v_transaction.branch_id AND product_id = v_item.product_id;

    -- Log movement (tipe void)
    INSERT INTO public.stock_movements (
      branch_id, product_id, type, quantity_change, reference_id, created_by
    ) VALUES (
      v_transaction.branch_id, v_item.product_id, 'void', v_stock_to_return, p_transaction_id, v_caller_id
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'message', 'Transaksi berhasil dibatalkan dan stok telah dikembalikan.');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
