import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getStripe, getStripeWebhookSecret, toStripeMinorUnits } from "@/lib/payments/stripe";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  let stripe: Stripe;
  let webhookSecret: string;
  try {
    stripe = getStripe();
    webhookSecret = getStripeWebhookSecret();
  } catch (error) {
    console.error("Stripe webhook configuration error:", error);
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 500 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    console.error("Stripe webhook request body read error:", error);
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  const isSessionFailure =
    event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired";
  if (
    !isSessionFailure &&
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  try {
    const metadata = session.metadata ?? {};
    if (isSessionFailure) {
      if (metadata.kind === "MEMBER_SUBSCRIPTION" && metadata.paymentId && metadata.subscriptionId && metadata.clubId) {
        await prisma.payment.updateMany({
          where: {
            id: metadata.paymentId,
            subscriptionId: metadata.subscriptionId,
            clubId: metadata.clubId,
            transactionId: session.id,
            paymentProvider: "STRIPE",
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });
      } else if (
        metadata.kind === "SAAS_SIGNUP" &&
        metadata.saasPaymentId &&
        metadata.subscriptionId &&
        metadata.clubId &&
        metadata.ownerId
      ) {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const failed = await tx.saasPayment.updateMany({
            where: {
              id: metadata.saasPaymentId,
              subscriptionId: metadata.subscriptionId,
              clubId: metadata.clubId,
              paymentProvider: "STRIPE",
              OR: [{ providerRef: session.id }, { providerRef: null }],
              status: "PENDING",
            },
            data: { status: "FAILED" },
          });
          if (failed.count === 0) return;
          await tx.user.deleteMany({
            where: { id: metadata.ownerId, clubId: metadata.clubId, role: "OWNER" },
          });
          await tx.club.deleteMany({ where: { id: metadata.clubId, status: "SUSPENDED" } });
        });
      } else if (metadata.kind === "SAAS_PLAN" && metadata.saasPaymentId && metadata.clubId) {
        await prisma.saasPayment.updateMany({
          where: {
            id: metadata.saasPaymentId,
            clubId: metadata.clubId,
            OR: [{ providerRef: session.id }, { providerRef: null }],
            paymentProvider: "STRIPE",
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });
      } else {
        console.warn("Stripe failure event has no recognized GymOS payment metadata", { sessionId: session.id });
      }
      return NextResponse.json({ received: true });
    }

    // Delayed payment methods complete checkout before funds settle. Wait for
    // async_payment_succeeded/failed instead of treating that return as paid.
    if (session.payment_status !== "paid") return NextResponse.json({ received: true });
    if (session.amount_total === null || !session.currency) {
      return NextResponse.json({ error: "Checkout session is missing its amount or currency" }, { status: 400 });
    }

    if (metadata.kind === "MEMBER_SUBSCRIPTION") {
      const { paymentId, subscriptionId, clubId, userId, planId, countryCode } = metadata;
      if (!paymentId || !subscriptionId || !clubId || !userId || !planId || !countryCode) {
        return NextResponse.json({ error: "Incomplete member checkout metadata" }, { status: 400 });
      }
      const payment = await prisma.payment.findFirst({
        where: { id: paymentId, subscriptionId, clubId, transactionId: session.id, paymentProvider: "STRIPE" },
        include: { subscription: true },
      });
      if (!payment) return NextResponse.json({ error: "Member payment not found" }, { status: 404 });
      if (payment.status === "PAID") return NextResponse.json({ received: true });
      if (
        payment.status !== "PENDING" ||
        payment.subscription.userId !== userId ||
        payment.subscription.planId !== planId ||
        payment.countryCode !== countryCode ||
        payment.currency.toLowerCase() !== session.currency ||
        toStripeMinorUnits(payment.amount, payment.currency) !== session.amount_total ||
        session.client_reference_id !== payment.id
      ) {
        console.error("Stripe member checkout does not match pending payment", { paymentId, sessionId: session.id });
        return NextResponse.json({ error: "Checkout does not match payment record" }, { status: 400 });
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, clubId, status: "PENDING", transactionId: session.id },
          data: { status: "PAID", paidAt: new Date() },
        });
        if (claimed.count === 0) return;
        const activated = await tx.subscription.updateMany({
          where: { id: subscriptionId, clubId, userId, planId, status: "PENDING" },
          data: { status: "ACTIVE" },
        });
        if (activated.count !== 1) throw new Error("Member subscription could not be activated");
      });
      return NextResponse.json({ received: true });
    }

    if (metadata.kind === "SAAS_PLAN" || metadata.kind === "SAAS_SIGNUP") {
      const { saasPaymentId, subscriptionId, clubId, planId, countryCode } = metadata;
      if (!saasPaymentId || !subscriptionId || !clubId || !planId || !countryCode) {
        return NextResponse.json({ error: "Incomplete SaaS checkout metadata" }, { status: 400 });
      }
      const payment = await prisma.saasPayment.findFirst({
        where: {
          id: saasPaymentId,
          subscriptionId,
          clubId,
          OR: [{ providerRef: session.id }, { providerRef: null }],
          paymentProvider: "STRIPE",
          countryCode,
        },
      });
      if (!payment) return NextResponse.json({ error: "SaaS payment not found" }, { status: 404 });
      if (payment.status === "PAID") return NextResponse.json({ received: true });
      if (
        payment.status !== "PENDING" ||
        payment.currency.toLowerCase() !== session.currency ||
        toStripeMinorUnits(payment.amount, payment.currency) !== session.amount_total ||
        session.client_reference_id !== payment.id
      ) {
        console.error("Stripe SaaS checkout does not match payment record", { saasPaymentId, sessionId: session.id });
        return NextResponse.json({ error: "Checkout does not match payment record" }, { status: 400 });
      }

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.saasPayment.updateMany({
          where: { id: payment.id, clubId, status: "PENDING", OR: [{ providerRef: session.id }, { providerRef: null }] },
          data: { status: "PAID", providerRef: session.id, paidAt: now },
        });
        if (claimed.count === 0) return;
        const activated = await tx.clubSubscription.updateMany({
          where: { id: subscriptionId, clubId },
          data: {
            planId,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            trialEndsAt: null,
          },
        });
        if (activated.count !== 1) throw new Error("Club subscription could not be activated");
        await tx.club.updateMany({
          where: { id: clubId, status: { in: ["TRIAL", "SUSPENDED"] } },
          data: { status: "ACTIVE" },
        });
      });
      return NextResponse.json({ received: true });
    }

    console.warn("Stripe checkout event received without a recognized GymOS payment kind", { sessionId: session.id });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook payment settlement error:", error);
    return NextResponse.json({ error: "Payment settlement failed" }, { status: 500 });
  }
}
