
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://utlquvplzdevvzcclfsh.supabase.co'

const supabasePublishableKey = 'sb_publishable_Si3CuW-Nyr_-h4m8574-zg_H_B3gYRa'

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
)
