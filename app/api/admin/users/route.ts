import { NextRequest, NextResponse } from "next/server";

function requireAuth(request: NextRequest) {
  const auth = request.cookies.get("gtw-auth");
  if (!auth) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { mockUsers } = await import("@/data/mockAdminData");
  return NextResponse.json(mockUsers);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const body = await request.json();
  return NextResponse.json({ ok: true, created: body.login });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = requireAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ code: "bad_request" }, { status: 400 });

  return NextResponse.json({ ok: true, deleted: id });
}
