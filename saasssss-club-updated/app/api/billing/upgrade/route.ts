import { NextResponse } from "next/server";

// Paid changes must settle through the signed Stripe Checkout webhook.
export async function POST() {
  return NextResponse.json(
    { error: "Cette route est désactivée. Utilisez la page de facturation pour créer un paiement sécurisé." },
    { status: 410 }
  );
}
