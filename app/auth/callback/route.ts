import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { normalizeJoinCode } from '@/lib/invitations'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const invite = normalizeJoinCode(searchParams.get('invite'))
  const destination = new URL('/', origin)
  if (invite) destination.searchParams.set('invite', invite)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(destination)
    }
  }

  destination.searchParams.set('auth_error', '1')
  return NextResponse.redirect(destination)
}