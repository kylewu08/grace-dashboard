import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/sheets'

export async function GET() {
  try {
    const config = await getConfig()
    return NextResponse.json(config)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
