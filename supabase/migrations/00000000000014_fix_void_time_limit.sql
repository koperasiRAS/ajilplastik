-- 1. Update fn_check_finance_edit_time_limit
CREATE OR REPLACE FUNCTION public.fn_check_finance_edit_time_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hanya berlaku jika operasi adalah UPDATE atau DELETE
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    -- Cek apakah hari kalender (WIB) sudah berganti
    IF DATE(now() AT TIME ZONE 'Asia/Jakarta') != DATE(OLD.created_at AT TIME ZONE 'Asia/Jakarta') THEN
      RAISE EXCEPTION 'Data keuangan tidak bisa diubah/dihapus karena sudah melewati hari berjalan. Hubungi Owner untuk koreksi manual.';
    END IF;
  END IF;
  
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Update fn_void_transaction
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
