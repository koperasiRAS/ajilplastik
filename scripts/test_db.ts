import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const localDate = '2026-06-20'
  const endDate = '2026-06-21'
  
  console.log('Querying transactions without limit...')
  const { data: trx, error } = await supabase.from('transactions').select('*').order('created_at', { ascending: false })
  if (error) {
    console.error(error)
    return
  }
  
  let totalOmset = 0
  let manualCount = 0
  trx.forEach(t => {
    // Only count within date range (in UTC, the DB is 00:00 but we assume these are recent)
    console.log(`[TRX] id: ${t.id}, num: ${t.transaction_number}, total: ${t.total_amount}, status: ${t.status}, branch: ${t.branch_id}, created_at: ${t.created_at}`)
    if (t.status === 'completed' || t.status === 'success') {
      totalOmset += t.total_amount
      manualCount++
    }
  })
  
  console.log(`\nManual sum of ALL transactions: ${totalOmset} (Count: ${manualCount})`)
  
  const { data: sum, error: errSum } = await supabase.rpc('fn_get_dashboard_summary', {
    p_branch_id: null,
    p_start_date: localDate,
    p_end_date: endDate,
    p_cashier_id: null
  })
  if (errSum) console.error(errSum)
  else console.log('Dashboard summary:', sum)

  const { data: profit, error: errProfit } = await supabase.rpc('fn_get_profit_loss', {
    p_branch_id: null,
    p_start_date: localDate,
    p_end_date: endDate
  })
  if (errProfit) console.error(errProfit)
  else console.log('Profit Loss summary:', profit)
}

test()
