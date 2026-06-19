-- Migration: POS Core Phase 2
-- Add new columns for discount and void
ALTER TABLE public.transactions
ADD COLUMN discount_amount numeric DEFAULT 0 CHECK (discount_amount >= 0),
ADD COLUMN void_reason text,
ADD COLUMN void_by uuid REFERENCES public.profiles(id);

-- Create RPC for checkout (atomic transaction)
CREATE OR REPLACE FUNCTION public.fn_checkout_pos(
  p_branch_id uuid,
  p_cashier_id uuid,
  p_payment_method public.payment_method_type,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_items jsonb -- Array of objects: {product_id, product_unit_id, unit_name_snapshot, conversion_to_base_snapshot, quantity, price_snapshot, subtotal}
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan sebagai admin agar bisa update multiple table, RLS dicek via param & logic
AS $$
DECLARE
  v_transaction_id uuid;
  v_transaction_number text;
  v_item jsonb;
  v_stock_record public.product_stock%ROWTYPE;
  v_calculated_total numeric := 0;
  v_stock_needed integer;
BEGIN
  -- 1. Validate total amount
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_calculated_total := v_calculated_total + (v_item->>'subtotal')::numeric;
  END LOOP;

  IF v_calculated_total - p_discount_amount != p_total_amount THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH';
  END IF;

  -- Generate transaction number (e.g. TRX-YYYYMMDD-HHMISS-RANDOM)
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
    -- All changes are automatically rolled back if ANY exception is raised
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- Create RPC for voiding transaction
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

  -- Check authorization: Caller must be owner OR (caller is cashier AND created the transaction AND it's within 24 hours)
  IF v_caller_role != 'owner' THEN
    IF v_transaction.cashier_id != v_caller_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: BUKAN_TRANSAKSI_ANDA';
    END IF;
    -- Syarat: Kasir hanya bisa void maksimal 24 jam setelah transaksi
    IF now() > v_transaction.created_at + interval '24 hours' THEN
      RAISE EXCEPTION 'UNAUTHORIZED: BATAS_WAKTU_VOID_HABIS';
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
