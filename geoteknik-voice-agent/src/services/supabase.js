const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getCustomerByPhone(phone) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone_number', phone)
    .single();
  if (error) return null;
  return data;
}

async function searchManuals(embedding, productName) {
  const { data, error } = await supabase.rpc('search_manuals', {
    query_embedding: embedding,
    product_filter: productName,
    match_count: 5
  });
  if (error) return [];
  return data;
}

async function saveCallHistory(record) {
  const { error } = await supabase
    .from('call_history')
    .insert(record);
  if (error) console.error('Error saving call history:', error);
}

module.exports = { getCustomerByPhone, searchManuals, saveCallHistory };