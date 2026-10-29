const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://iryeosxfpeeeeeyzonsa.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyeWVvc3hmcGVlZWVleXpvbnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTMyODYsImV4cCI6MjEwNzY4OTI4Nn0.tp1HgSpFp6Poj7zd65kA_0cPz3avtoqt8kPSmdFAduY'
);

async function checkIds() {
  const { data: years } = await sb.from('academic_years').select('*');
  console.log('Years in Supabase:', years);

  const { data: cats } = await sb.from('billing_categories').select('*');
  console.log('Categories in Supabase:', cats);
}
checkIds();
