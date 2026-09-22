import { NextResponse } from 'next/server';
import { authEnabled, isAuthorised } from '@/lib/auth';

/** Lets the UI know whether to show a sign-in link and whether edits will work. */
export async function GET(request: Request) {
  const enabled = authEnabled();
  return NextResponse.json({
    success: true,
    enabled,
    loggedIn: enabled ? await isAuthorised(request) : true,
  });
}
