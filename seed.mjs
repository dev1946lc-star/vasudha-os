// Seeds a demo tenant so the app can be exercised end to end.
//
//   node --env-file=.env seed.mjs
//
// Credentials come from the environment — never hardcode them here, this file
// is committed. Run `supabase db reset` first so every migration is applied.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Run with:  node --env-file=.env seed.mjs')
  process.exit(1)
}

// The service role bypasses RLS, which is what we want for a seed script.
const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const DEMO = {
  email: 'owner@vasudha.demo',
  password: 'vasudha-demo-2024',
  company: {
    name: 'Karnataka Bio-Fuels Pvt Ltd',
    gst_number: '29ABCDE1234F1Z5',
    address: '14 Industrial Suburb, Yeshwanthpur, Bengaluru 560022',
  },
}

const RESTAURANTS = [
  { name: 'Hotel Malabar', contact_person: 'Ramesh Iyer', phone: '+91 9845012345', address: '12 MG Road, Bengaluru 560001', credit_limit: 250000, payment_terms_days: 15 },
  { name: 'Udupi Bhavan', contact_person: 'Sunita Rao', phone: '+91 9845012346', address: '56 Church Street, Bengaluru 560001', credit_limit: 120000, payment_terms_days: 7 },
  { name: 'Nandhana Bistro', contact_person: 'Prakash Nair', phone: '+91 9845012347', address: '88 Koramangala 4th Block, Bengaluru 560034', credit_limit: 90000, payment_terms_days: 10 },
  { name: 'Empire Restaurant', contact_person: 'Anita Desai', phone: '+91 9845012348', address: '23 Brigade Road, Bengaluru 560025', credit_limit: 400000, payment_terms_days: 30 },
  { name: 'Sagar Dhaba', contact_person: 'Vijay Menon', phone: '+91 9845012349', address: '9 Jayanagar 4th Block, Bengaluru 560011', credit_limit: 60000, payment_terms_days: 7 },
  { name: 'Adyar Idli Kadai', contact_person: 'Lakshmi Subramanian', phone: '+91 9845012350', address: '31 Adyar Main Road, Chennai 600020', credit_limit: 150000, payment_terms_days: 15 },
  { name: 'Kalsyani Veg', contact_person: 'Ganesh Pillai', phone: '+91 9845012351', address: '4 Banashankari 2nd Stage, Bengaluru 560070', credit_limit: 80000, payment_terms_days: 10 },
  { name: 'Truffle Cafe (Closed)', contact_person: 'Rehan Khan', phone: '+91 9845012352', address: '2 Residency Road, Bengaluru 560025', credit_limit: 50000, payment_terms_days: 15, is_active: false },
]

const PRODUCTS = [
  { name: 'Refined Cooking Oil 20L', hsn_code: '15121100', price: 2350, gst_rate: 5, min_stock_level: 40, description: 'Branded sunflower-based refined edible oil, 20 litre pail' },
  { name: 'Cold Pressed Groundnut Oil 5L', hsn_code: '15089020', price: 1450, gst_rate: 5, min_stock_level: 25, description: 'Wood-pressed groundnut oil for commercial kitchens' },
  { name: 'Rice Bran Oil 20L', hsn_code: '15121110', price: 1980, gst_rate: 5, min_stock_level: 30, description: 'High oleic rice bran oil, low trans-fat' },
  { name: 'Blended Used Oil (Bulk)', hsn_code: '15180010', price: 62000, gst_rate: 18, min_stock_level: 2, description: 'Collected and filtered used cooking oil for biodiesel processing' },
  { name: 'Ghee 5kg', hsn_code: '04061000', price: 4250, gst_rate: 12, min_stock_level: 20, description: 'Bottled clarified butter for institutional use' },
  { name: 'Mustard Oil 10L', hsn_code: '15121190', price: 1720, gst_rate: 5, min_stock_level: 35, description: 'Cold pressed kachi ghhani mustard oil' },
]

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function money(n) {
  return Number(Number(n).toFixed(2))
}

// Identity belongs to Clerk, not Supabase Auth. The app's sessions are Clerk
// sessions and profiles.id stores a Clerk id (`user_2abc...`), so the demo owner
// has to be created through Clerk's admin API. Creating a Supabase auth user
// instead produces an identity the application never reads — anyone seeded that
// way cannot sign in.
//
// Needs CLERK_SECRET_KEY. Without it there is no way to produce a usable demo
// account, so this fails loudly rather than seeding data nobody can reach.
async function createDemoOwner() {
  const clerkSecret = process.env.CLERK_SECRET_KEY
  if (!clerkSecret) {
    throw new Error(
      'CLERK_SECRET_KEY is required to seed a demo owner. The application ' +
        'authenticates with Clerk, so the owner must be a Clerk user.',
    )
  }

  const clerkHeaders = {
    Authorization: `Bearer ${clerkSecret}`,
    'Content-Type': 'application/json',
  }

  // Reuse the account if a previous seed already created it.
  const listRes = await fetch('https://api.clerk.com/v1/users?email_address=' +
    encodeURIComponent(DEMO.email) + '&limit=1', { headers: clerkHeaders })

  if (listRes.ok) {
    const list = await listRes.json()
    if (Array.isArray(list) && list.length > 0) {
      console.log(`• Reusing existing Clerk user ${list[0].id}`)
      return list[0].id
    }
  }

  const createRes = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: clerkHeaders,
    body: JSON.stringify({
      email_address: DEMO.email,
      password: DEMO.password,
      first_name: 'Demo',
      last_name: 'Owner',
      skip_password_requirement: false,
    }),
  })

  if (!createRes.ok) {
    throw new Error(
      `Clerk rejected the demo user (${createRes.status}): ${await createRes.text()}`,
    )
  }

  const created = await createRes.json()
  console.log(`• Created Clerk user ${created.id} (${DEMO.email})`)
  return created.id
}

async function seed() {
  console.log('Seeding VASUDHA OS demo tenant...\n')

  const userId = await createDemoOwner()

  const { data: company, error: companyError } = await db
    .from('companies')
    .insert({ ...DEMO.company, default_gst_rate: 5 })
    .select()
    .single()

  if (companyError) throw new Error(`companies: ${companyError.message}`)
  console.log(`• Company ${company.id} — ${company.name}`)

  // The profiles trigger mirrors role/company_id into clerk_metadata, which the
  // Next.js server copies onto the Clerk user so the JWT carries both claims.
  const { error: profileError } = await db.from('profiles').insert({
    id: userId,
    company_id: company.id,
    role: 'owner',
    name: 'Demo Owner',
  })
  if (profileError) throw new Error(`profiles: ${profileError.message}`)
  console.log(`• Owner profile bound to ${DEMO.email}`)

  const { data: restaurants, error: rError } = await db
    .from('restaurants')
    .insert(
      RESTAURANTS.map((r) => ({
        company_id: company.id,
        name: r.name,
        address: r.address,
        contact_person: r.contact_person,
        phone: r.phone,
        credit_limit: r.credit_limit,
        payment_terms_days: r.payment_terms_days,
        is_active: r.is_active ?? true,
      })),
    )
    .select()
  if (rError) throw new Error(`restaurants: ${rError.message}`)
  console.log(`• ${restaurants.length} restaurants`)

  const { data: products, error: pError } = await db
    .from('products')
    .insert(PRODUCTS.map((p) => ({ company_id: company.id, is_active: true, ...p })))
    .select()
  if (pError) throw new Error(`products: ${pError.message}`)
  console.log(`• ${products.length} products`)

  // ── Collections ──────────────────────────────────────────────────
  // Inserted straight at their final status. The auto-deduction trigger only
  // reacts to rows *becoming* 'completed', so seeding this way keeps the
  // inventory numbers below exact and idempotent.
  const active = restaurants.filter((r) => r.is_active)
  const oilProducts = products.filter((p) => p.hsn_code.startsWith('15'))

  const collectionRows = []
  for (const restaurant of active) {
    for (const daysBack of [0, 1, 3, 6, 9, 12, 18, 24, 31, 45, 63, 78]) {
      // Not every restaurant is visited every day.
      if ((daysBack + restaurant.name.length) % 4 === 0) continue

      const itemCount = 1 + ((daysBack + restaurant.name.length) % 3)
      const items = oilProducts.slice(0, itemCount).map((p, i) => {
        const quantity = 8 + ((daysBack * 3 + i * 7) % 40)
        const returnQuantity = quantity % 5 === 0 ? Math.floor(quantity / 4) : 0
        return { p, quantity, returnQuantity }
      })

      const totalAmount = items.reduce(
        (sum, it) => sum + it.quantity * it.p.price,
        0,
      )
      const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0)

      collectionRows.push({
        restaurant,
        daysBack,
        items,
        totalAmount,
        totalQuantity,
        // Today's route stays partly in progress so the dashboard has both
        // completed and pending stops to show.
        status: daysBack === 0 ? 'completed' : 'verified',
      })
    }
  }

  const { data: collections, error: cError } = await db
    .from('collections')
    .insert(
      collectionRows.map((c) => ({
        company_id: company.id,
        restaurant_id: c.restaurant.id,
        agent_id: userId,
        collection_date: daysAgo(c.daysBack),
        status: c.status,
        notes: c.daysBack === 0 ? 'Same-day top-up run' : null,
        total_quantity: money(c.totalQuantity),
        total_amount: money(c.totalAmount),
      })),
    )
    .select()
  if (cError) throw new Error(`collections: ${cError.message}`)
  console.log(`• ${collections.length} collections`)

  const itemRows = collections.flatMap((collection) => {
    const seed = collectionRows.find((c) => daysAgo(c.daysBack) === collection.collection_date && c.restaurant.id === collection.restaurant_id)
    if (!seed) return []
    return seed.items.map((it) => ({
      collection_id: collection.id,
      product_id: it.p.id,
      quantity: money(it.quantity),
      return_quantity: money(it.returnQuantity),
      price_per_unit: money(it.p.price),
      amount: money(it.quantity * it.p.price),
    }))
  })
  const { error: ciError } = await db.from('collection_items').insert(itemRows)
  if (ciError) throw new Error(`collection_items: ${ciError.message}`)
  console.log(`• ${itemRows.length} collection line items`)

  // ── Invoices ─────────────────────────────────────────────────────
  // One invoice per non-today collection, with GST split from the product rate.
  const invoiceSources = collections.filter((c) => c.collection_date !== daysAgo(0))
  const invoiceRows = invoiceSources.map((collection) => {
    const source = collectionRows.find(
      (c) => c.restaurant.id === collection.restaurant_id && daysAgo(c.daysBack) === collection.collection_date,
    )
    const subtotal = money(source?.totalAmount ?? 0)
    const rate = (source?.items[0]?.p.gst_rate ?? 5) / 100
    const cgst = money(subtotal * rate / 2)
    const sgst = money(subtotal * rate / 2)
    return {
      collection,
      subtotal,
      cgst,
      sgst,
      igst: 0,
      total: money(subtotal + cgst + sgst),
      ym: collection.collection_date.slice(0, 7).replace('-', ''),
    }
  })

  // INV-YYYYMM-#### per calendar month.
  const seqByMonth = new Map()
  const invoiceNumbers = invoiceRows.map(({ ym }) => {
    const next = (seqByMonth.get(ym) ?? 0) + 1
    seqByMonth.set(ym, next)
    return `INV-${ym}-${String(next).padStart(4, '0')}`
  })

  const { data: invoices, error: iError } = await db
    .from('invoices')
    .insert(
      invoiceRows.map(({ collection, subtotal, cgst, sgst, igst, total }, i) => ({
        company_id: company.id,
        restaurant_id: collection.restaurant_id,
        invoice_number: invoiceNumbers[i],
        invoice_date: collection.collection_date,
        subtotal,
        cgst,
        sgst,
        igst,
        total_amount: total,
        status: 'unpaid',
      })),
    )
    .select()
  if (iError) throw new Error(`invoices: ${iError.message}`)

  await db.from('invoice_sequences').upsert(
    // The key is the YYYYMM prefix, which is only needed to address the row.
    [...seqByMonth.keys()].map((month) => ({
      company_id: company.id,
      last_value: seqByMonth.get(month),
    })),
  )
  console.log(`• ${invoices.length} invoices`)

  // Link each collection to its invoice by the unique invoice_number rather than
  // by array position — PostgREST does not guarantee that a multi-row INSERT
  // returns rows in insertion order.
  const invoiceIdByNumber = new Map(invoices.map((inv) => [inv.invoice_number, inv.id]))
  await Promise.all(
    invoiceRows.map(({ collection }, i) => {
      const invoiceId = invoiceIdByNumber.get(invoiceNumbers[i])
      if (!invoiceId) {
        throw new Error(`No invoice returned for ${invoiceNumbers[i]}`)
      }
      return db.from('collections').update({ invoice_id: invoiceId }).eq('id', collection.id)
    }),
  )
  console.log(`• ${invoiceNumbers.length} collection→invoice links`)

  // ── Payments ─────────────────────────────────────────────────────
  // The invoice_status trigger (12_invoice_status_trigger.sql) recomputes each
  // invoice's status from the sum of its payments, so nothing is set by hand.
  const paymentRows = []
  invoices.forEach((invoice, i) => {
    const total = Number(invoice.total_amount)
    const ageDays = Math.round(
      (Date.now() - new Date(invoice.invoice_date).getTime()) / 86_400_000,
    )

    let amount
    if (ageDays <= 3) amount = total // current
    else if (ageDays <= 15) amount = money(total * 0.6) // partial
    else if (ageDays % 5 === 0) amount = 0 // older invoices stay unpaid
    else amount = total

    if (amount <= 0) return

    const modes = ['upi', 'bank_transfer', 'cash', 'cheque']
    paymentRows.push({
      company_id: company.id,
      restaurant_id: invoice.restaurant_id,
      invoice_id: invoice.id,
      amount,
      payment_mode: modes[i % modes.length],
      payment_date: invoice.invoice_date,
      reference_number: `PAY${String(10_000 + i)}`,
    })
  })

  const { error: payError } = await db.from('payments').insert(paymentRows)
  if (payError) throw new Error(`payments: ${payError.message}`)
  console.log(`• ${paymentRows.length} payments`)

  // ── Inventory ────────────────────────────────────────────────────
  const stockLevels = [820, 340, 96, 7, 410, 265]
  const { error: invError } = await db.from('inventory').insert(
    products.map((p, i) => ({
      company_id: company.id,
      product_id: p.id,
      quantity: stockLevels[i % stockLevels.length],
      last_updated: new Date().toISOString(),
    })),
  )
  if (invError) throw new Error(`inventory: ${invError.message}`)
  console.log(`• ${products.length} inventory records`)

  console.log('\nSeed complete.')
  console.log(`  Sign in at /login with ${DEMO.email} / ${DEMO.password}`)
}

seed().catch((err) => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})