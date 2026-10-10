-- Plan deletion / plan-usage counts filter subscriptions by planId; the FK had no index.
-- CreateIndex
CREATE INDEX "subscriptions_planId_idx" ON "subscriptions"("planId");
