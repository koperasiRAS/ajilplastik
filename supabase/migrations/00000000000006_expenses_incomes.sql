-- 1. Buat Storage Bucket untuk Bukti Pengeluaran/Pemasukan
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance_attachments', 'finance_attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS untuk Storage Bucket (Hanya Authenticated user yang role-nya owner)
-- Karena RLS storage terpisah dari schema public, kita buat policy sederhana:
CREATE POLICY "Finance attachments viewable by all authenticated"
ON storage.objects FOR SELECT
USING (bucket_id = 'finance_attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Finance attachments insertable by authenticated"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'finance_attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Finance attachments updatable by authenticated"
ON storage.objects FOR UPDATE
USING (bucket_id = 'finance_attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Finance attachments deletable by authenticated"
ON storage.objects FOR DELETE
USING (bucket_id = 'finance_attachments' AND auth.role() = 'authenticated');

-- 3. Trigger untuk mencegah Edit/Delete data yang lebih dari 24 jam
CREATE OR REPLACE FUNCTION public.fn_check_finance_edit_time_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Hanya berlaku jika operasi adalah UPDATE atau DELETE
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    -- Cek selisih waktu antara sekarang dan waktu pembuatan (created_at)
    IF (EXTRACT(EPOCH FROM (now() - OLD.created_at)) > 86400) THEN
      RAISE EXCEPTION 'Data keuangan tidak bisa diubah/dihapus karena sudah melewati 24 jam sejak dibuat. Hal ini untuk menjaga integritas laporan.';
    END IF;
  END IF;
  
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Pasang trigger di tabel expenses
DROP TRIGGER IF EXISTS trg_expenses_time_limit ON public.expenses;
CREATE TRIGGER trg_expenses_time_limit
BEFORE UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_finance_edit_time_limit();

-- Pasang trigger di tabel incomes
DROP TRIGGER IF EXISTS trg_incomes_time_limit ON public.incomes;
CREATE TRIGGER trg_incomes_time_limit
BEFORE UPDATE OR DELETE ON public.incomes
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_finance_edit_time_limit();
