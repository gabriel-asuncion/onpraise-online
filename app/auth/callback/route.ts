import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  
  // ✅ SURGICAL FIX: Grab the 'next' parameter or 'invite' parameter
  const next = searchParams.get('next')
  const invite = searchParams.get('invite')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // If we passed a 'next' route (like /onboarding?invite=...), go there directly!
      if (next) {
        return NextResponse.redirect(`${origin}${next}`)
      }
      // Fail-safe: if there's an invite but no 'next', route them manually
      if (invite) {
        return NextResponse.redirect(`${origin}/onboarding?invite=${invite}`)
      }
      
      // Default fallback
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // return the user to an error page with some instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}