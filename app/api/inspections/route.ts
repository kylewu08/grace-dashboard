import { NextRequest, NextResponse } from 'next/server'
import { getInspections, addInspection, updateInspection, deleteInspection } from '@/lib/tracking'

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function GET() {
  try { return NextResponse.json(await getInspections()) } catch (e) { return err(e) }
}

export async function POST(req: NextRequest) {
  try { return NextResponse.json({ success: true, id: await addInspection(await req.json()) }) } catch (e) { return err(e) }
}

export async function PUT(req: NextRequest) {
  try { const { id, ...d } = await req.json(); await updateInspection(id, d); return NextResponse.json({ success: true }) } catch (e) { return err(e) }
}

export async function DELETE(req: NextRequest) {
  try { const { id } = await req.json(); await deleteInspection(id); return NextResponse.json({ success: true }) } catch (e) { return err(e) }
}
