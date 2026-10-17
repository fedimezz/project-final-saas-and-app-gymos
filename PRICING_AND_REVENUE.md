# ClubX — what to charge and what you earn

All numbers are **proposals**; costs and exchange rates change — check current prices before committing. ≈ 3 TND per USD (verify).

## 1. Recurring plans (already in the seed: set in `/platform/plans`)
| Plan | Price | Who |
|---|---|---|
| Starter | **29 USD/mo** (~90 TND) | small gym, 1 location |
| Pro | **79 USD/mo** (~240 TND) | gym with coaches, analytics |
| Business | **199 USD/mo** (~600 TND) | chains / white-label |
Annual option to add later: pay 10 months, get 12 (cash up front, fewer churn points).

## 2. One-time services (set in `/platform/services` → "Prix des services")
| Service | Suggested price | Your cost / effort | Margin |
|---|---|---|---|
| Custom domain (client buys the domain) | **40 USD setup + 5 USD/mo** | ~20 min DNS + Vercel domain add | ~100 % |
| Custom domain (you buy + manage it) | domain price + 15 USD, then 5 USD/mo | .com ≈ 12–15 USD/yr, .tn via registrar | ~15 USD + recurring |
| Professional setup (you build pages, content, theme) | **150 USD** (Starter) – **250 USD** (Pro+) | 3–5 h | ~35–50 USD/h |
| Website personalization (extra edits after the 1 free edit + lock) | **60 USD per request** | 1–2 h | ~30–60 USD/h |
| **Pack Premium** (3 premium themes + 3 premium 3D models, one-time unlock) | **59 USD** | 0 (already built) | ~100 % |
| Custom 3D model made for the club | **150 USD+** | 2–4 h | quote |

Benefit rule: the theme is **locked after the setup + 1 extra edit**; every later change is a paid request → recurring income for you with no code.

## 3. Your monthly costs (approx., verify)
Vercel Pro ≈ 20 USD · Neon ≈ 0–19 USD · Upstash ≈ 0–10 USD · Resend 0–20 USD · Cloudinary 0–89 USD (free tier first) · domain ≈ 1–2 USD/mo · **≈ 60–100 USD/mo** fixed. Stripe ≈ 3–4 % + fixed fee per card payment. Apple Developer 99 USD/yr only if you ship iOS.
**Break-even ≈ 3–4 Starter clubs.**

## 4. Scenarios (monthly recurring, before costs)
| Clubs | Mix (Starter/Pro/Business) | Recurring/mo | After ~4 % fees and ~90–150 fixed |
|---|---|---|---|
| 10 | 6 / 3 / 1 | 6×29 + 3×79 + 199 = **610** | ≈ 440–500 |
| 25 | 15 / 8 / 2 | 435 + 632 + 398 = **1 465** | ≈ 1 250 |
| 50 | 28 / 17 / 5 | 812 + 1 343 + 995 = **3 150** | ≈ 2 850 |
Add one-time services: if 4 of 10 clubs buy a domain (40 + 5/mo) and 3 buy the Premium pack (59): **+337 once, +20/mo**.
Trial conversion assumption: 10–25 % of no-card 14-day trials become paying (rule of thumb, not measured). 100 trials ⇒ ~15 clubs ⇒ ~**900 USD/mo** at the 10-club mix.

## 5. Practical advice
- Tunisian owners will mostly pay by transfer/D17: keep the TND amount in `MANUAL_PAYMENT_INSTRUCTIONS`, confirm within 24 h, and reply on WhatsApp.
- Do not discount the plan; discount the **setup** (e.g. free setup on annual).
- Review prices after the first 10 paying clubs, not before.
