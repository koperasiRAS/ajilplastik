import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testShifts() {
  console.log("=== STARTING SHIFT TESTS ===\n");

  // Authentication
  console.log("Logging in as owner...");
  const ownerAuth = await supabase.auth.signInWithPassword({
    email: 'admin@ajilplastik.com',
    password: 'password123'
  });
  if (ownerAuth.error) throw ownerAuth.error;

  console.log("Logging in as cashier...");
  const cashierAuth = await supabase.auth.signInWithPassword({
    email: 'kasir_pusat@ajilplastik.com',
    password: 'password123'
  });
  if (cashierAuth.error) throw cashierAuth.error;
  const cashierId = cashierAuth.data.user.id;

  // Setup: Find a branch and a product
  const { data: branch } = await supabase.from('branches').select('id, name').limit(1).single();
  const branchId = branch?.id;

  const { data: productStock } = await supabase
    .from('product_stock')
    .select('*, product:products(*)')
    .eq('branch_id', branchId)
    .gt('quantity', 10)
    .limit(1)
    .single();

  const productId = productStock?.product_id;
  const unitId = productStock?.product.base_unit_id;
  const stockQty = productStock?.quantity;
  const price = productStock?.product.price_base;

  console.log(`Test using Branch: ${branch!.name}`);
  console.log(`Test using Product: ${productStock!.product.name} (Current Stock: ${stockQty}, Price: ${price})\n`);

  // RESET SHIFT FIRST (Just in case there are open shifts from previous manual testing)
  console.log("Resetting all open shifts (force close)...");
  await supabase.auth.signInWithPassword({ email: 'admin@ajilplastik.com', password: 'password123' }); // Login as owner
  const { data: openShifts } = await supabase.from('shifts').select('*').eq('status', 'open');
  if (openShifts && openShifts.length > 0) {
      for (const s of openShifts) {
          await supabase.rpc('fn_close_shift', { p_shift_id: s.id, p_closing_balance_actual: 0 });
      }
  }
  
  // Re-login cashier
  await supabase.auth.signInWithPassword({ email: 'kasir_pusat@ajilplastik.com', password: 'password123' });

  // TEST (B): Coba checkout TANPA shift aktif -> Harus DITOLAK
  console.log("TEST (B): Checkout TANPA shift aktif...");
  const failedCheckout = await supabase.rpc('fn_checkout_pos', {
    p_branch_id: branchId,
    p_cashier_id: cashierId,
    p_shift_id: '00000000-0000-0000-0000-000000000000', // Invalid/No shift
    p_payment_method: 'cash',
    p_total_amount: price * 1,
    p_discount_amount: 0,
    p_items: [{
      product_id: productId,
      product_unit_id: unitId,
      unit_name_snapshot: 'Pcs',
      conversion_to_base_snapshot: 1,
      quantity: 1,
      price_snapshot: price,
      subtotal: price * 1
    }]
  });
  if (failedCheckout.error || failedCheckout.data?.success === false) {
    console.log("✅ Berhasil DITOLAK:", failedCheckout.error?.message || failedCheckout.data?.error);
  } else {
    console.error("❌ GAGAL! Checkout berhasil padahal tidak ada shift aktif.");
  }

  // TEST (A) & (C): Buka shift, buka shift kedua, transaksi cash, tutup shift
  console.log("\nTEST (A) & (C): Buka shift...");
  const openResult = await supabase.rpc('fn_open_shift', {
    p_branch_id: branchId,
    p_opening_balance: 100000
  });
  if (openResult.error) throw openResult.error;
  const shiftId = openResult.data.shift_id;
  console.log(`✅ Shift dibuka dengan ID: ${shiftId} (Modal: Rp 100.000)`);

  console.log("TEST (C): Buka shift kedua...");
  const openSecond = await supabase.rpc('fn_open_shift', {
    p_branch_id: branchId,
    p_opening_balance: 50000
  });
  if (openSecond.error || openSecond.data?.success === false) {
    console.log("✅ Buka shift kedua berhasil DITOLAK:", openSecond.error?.message || openSecond.data?.error);
  } else {
    console.error("❌ GAGAL! Buka shift kedua berhasil padahal sudah ada shift aktif.");
  }

  console.log("\nMelakukan transaksi di dalam shift aktif...");
  const checkout1 = await supabase.rpc('fn_checkout_pos', {
    p_branch_id: branchId,
    p_cashier_id: cashierId,
    p_shift_id: shiftId,
    p_payment_method: 'cash',
    p_total_amount: price * 2,
    p_discount_amount: 0,
    p_items: [{
      product_id: productId,
      product_unit_id: unitId,
      unit_name_snapshot: 'Pcs',
      conversion_to_base_snapshot: 1,
      quantity: 2,
      price_snapshot: price,
      subtotal: price * 2
    }]
  });
  if (checkout1.error) throw checkout1.error;
  if (!checkout1.data?.success) throw new Error(checkout1.data?.error);
  console.log(`✅ Transaksi berhasil: ${checkout1.data.transaction_number} (Total: ${price * 2})`);

  console.log("Menutup shift...");
  // Ekspektasi: Modal awal (100.000) + Total Kas (price * 2)
  const actualCash = 100000 + (price * 2);
  const closeResult = await supabase.rpc('fn_close_shift', {
    p_shift_id: shiftId,
    p_closing_balance_actual: actualCash
  });
  if (closeResult.error) throw closeResult.error;
  const cr = closeResult.data;
  console.log("✅ Shift berhasil ditutup.");
  console.log(`- Ekspektasi Sistem: ${cr.expected}`);
  console.log(`- Kas Aktual Kasir: ${cr.actual}`);
  console.log(`- Selisih: ${cr.difference}`);
  console.log(`- Summary:`, cr.summary);
  if (cr.difference === 0 && cr.summary.total_cash === price * 2) {
    console.log("✅ Perhitungan shift akurat!");
  } else {
    console.error("❌ Perhitungan shift TIDAK AKURAT!");
  }

  // TEST VOID AFTER CLOSED SHIFT
  console.log("\nTEST: Void transaksi yang shift-nya sudah closed...");
  const voidResult = await supabase.rpc('fn_void_transaction', {
      p_transaction_id: checkout1.data.transaction_id,
      p_void_reason: 'Test void'
  });
  if (voidResult.error || voidResult.data?.success === false) {
      console.log("✅ Void berhasil DITOLAK:", voidResult.error?.message || voidResult.data?.error);
  } else {
      console.error("❌ GAGAL! Void berhasil padahal shift sudah ditutup.");
  }


  // TEST (D): Race Condition
  console.log("\nTEST (D): Menguji Atomicity (Race Condition) dengan Shift Aktif...");
  // Buka shift baru untuk test ini
  const openRace = await supabase.rpc('fn_open_shift', {
    p_branch_id: branchId,
    p_opening_balance: 0
  });
  const shiftRaceId = openRace.data.shift_id;
  
  // Refresh current stock
  const { data: stockBeforeRace } = await supabase
    .from('product_stock')
    .select('quantity')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .single();
    
  const currentQty = stockBeforeRace?.quantity;
  console.log(`Current Stock before race condition: ${currentQty}`);

  // Kita akan mencoba membeli seluruh stok yang tersisa SECARA BERSAMAAN lewat 2 proses paralel
  const checkoutPayload = {
    p_branch_id: branchId,
    p_cashier_id: cashierId,
    p_shift_id: shiftRaceId,
    p_payment_method: 'cash',
    p_total_amount: price * currentQty,
    p_discount_amount: 0,
    p_items: [{
      product_id: productId,
      product_unit_id: unitId,
      unit_name_snapshot: 'Pcs',
      conversion_to_base_snapshot: 1,
      quantity: currentQty,
      price_snapshot: price,
      subtotal: price * currentQty
    }]
  };

  console.log(`Menjalankan 2 transaksi serentak, masing-masing meminta ${currentQty} item...`);
  
  const [res1, res2] = await Promise.all([
    supabase.rpc('fn_checkout_pos', checkoutPayload),
    supabase.rpc('fn_checkout_pos', checkoutPayload)
  ]);

  console.log("Result 1:", res1.data?.success ? "SUCCESS" : "FAILED", res1.data?.error || "");
  console.log("Result 2:", res2.data?.success ? "SUCCESS" : "FAILED", res2.data?.error || "");

  if ((res1.data?.success && !res2.data?.success) || (!res1.data?.success && res2.data?.success)) {
      console.log("✅ Race condition ter-handle dengan baik! Hanya 1 transaksi yang tembus.");
  } else {
      console.error("❌ GAGAL! Atomicity rusak, keduanya tembus atau keduanya gagal secara tidak wajar.");
  }

  // Cek stok setelah race condition
  const { data: stockAfterRace } = await supabase
    .from('product_stock')
    .select('quantity')
    .eq('branch_id', branchId)
    .eq('product_id', productId)
    .single();
  console.log(`Final Stock after race condition: ${stockAfterRace?.quantity} (Seharusnya 0)`);

  // Tutup shift race condition
  await supabase.rpc('fn_close_shift', {
    p_shift_id: shiftRaceId,
    p_closing_balance_actual: price * currentQty
  });

  console.log("\n=== ALL SHIFT TESTS FINISHED ===");
}

testShifts().catch(console.error);
