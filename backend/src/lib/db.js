const { createClient } = require('@supabase/supabase-js')

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env')
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function connectDB() {
  const { error } = await supabase.from('users').select('id').limit(1)
  if (error && error.code !== 'PGRST116') {
    console.error('Supabase connection error:', error.message)
    process.exit(1)
  }
  console.log('Supabase connected:', process.env.SUPABASE_URL)
}

module.exports = { supabase, connectDB }
