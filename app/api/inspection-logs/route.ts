import { NextRequest, NextResponse } from 'next/server'
import { addInspectionLog, deleteInspectionLog } from '@/lib/tracking'

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function POST(req: NextRequest) {
  try { return NextResponse.json({ success: true, id: await addInspectionLog(await req.json()) }) } catch (e) { return err(e) }
}

export async function DELETE(req: NextRequest) {
  try { const { id } = await req.json(); await deleteInspectionLog(id); return NextResponse.json({ success: true }) } catch (e) { return err(e) }
}
