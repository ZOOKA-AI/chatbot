import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Guest auto-provisioning disabled: always require real sign-up
  return NextResponse.redirect(new URL("/login", request.url));
}
