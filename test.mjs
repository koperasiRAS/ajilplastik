import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabase = createClient(
  'https://cwcpxbkozfcfmxmwmmrn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3Y3B4YmtvemZjZm14bXdtbXJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTY5MDUzMCwiZXhwIjoyMDk3MjY2NTMwfQ.dyJtCeYnqFL82jzc_PtFvK5n9KKIDAZCjM7uKRfDmZQ'
)

async function test() {
  const sql = `
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
      conversion_to_base_snapshot, quantity, price_snapshot, buy_price_snapshot, subtotal
    ) VALUES (
      v_transaction_id, (v_item->>'product_id')::uuid, (v_item->>'product_unit_id')::uuid, 
      v_item->>'unit_name_snapshot', (v_item->>'conversion_to_base_snapshot')::integer, 
      (v_item->>'quantity')::integer, (v_item->>'price_snapshot')::numeric, 
      (v_item->>'buy_price_snapshot')::numeric, (v_item->>'subtotal')::numeric
    );

  END LOOP;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'transaction_number', v_transaction_number);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
`

  // Supabase JS library doesn't expose a raw sql method natively without an RPC
  // Wait, I can't just run raw SQL easily via the JS client unless I have an RPC for it.
  console.log("SQL to execute:\\n", sql)
}

test()
