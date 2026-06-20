-- Perbaikan RLS Policy agar Owner (yang branch_id-nya NULL) tetap bisa mencatat log buka laci

DROP POLICY IF EXISTS "Users can insert logs for their branch" ON cash_drawer_logs;

CREATE POLICY "Users can insert logs for their branch"
    ON cash_drawer_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        branch_id = (SELECT branch_id FROM profiles WHERE id = auth.uid()) 
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
    );
