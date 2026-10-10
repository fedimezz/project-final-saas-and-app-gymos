import { NextRequest, NextResponse } from "next/server";
import { detectPaymentCountry } from "@/lib/payment-country";

export async function GET(request: NextRequest) {
  return NextResponse.json({ countryCode: detectPaymentCountry(request.headers) }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
