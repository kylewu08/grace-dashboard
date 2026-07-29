import { NextRequest, NextResponse } from 'next/server'
import { getComplaints, addComplaint, updateComplaint, deleteComplaint } from '@/lib/tracking'

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function GET() {
  try { return NextResponse.json(await getComplaints()) } catch (e) { return err(e) }
}

export async function POST(req: NextRequest) {
  try { return NextResponse.json({ success: true, id: await addComplaint(await req.json()) }) } catch (e) { return err(e) }
}

export async function PUT(req: NextRequest) {
  try { const { id, ...d } = await req.json(); await updateComplaint(id, d); return NextResponse.json({ success: true }) } catch (e) { return err(e) }
}

export async function DELETE(req: NextRequest) {
  try { const { id } = await req.json(); await deleteComplaint(id); return NextResponse.json({ success: true }) } catch (e) { return err(e) }
}
