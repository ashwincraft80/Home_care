# Research → product

These sources informed product decisions. They are **inputs, not proof** that HomeCare will
succeed — none of them studies this product. Each finding below is limited to what we could
actually read on 22 Oct 2026, and every implication is marked as **evidence-backed** (the source
directly supports the design choice) or a **hypothesis** (plausible, must be validated with our
own pilot data).

| # | Source | What we could access |
|---|--------|----------------------|
| 1 | Chauhan, Gajpal, Bhardwaj, Kumar, Goyal, Yang & Bhardwaj (2023). *Examining Consumers' Behavioral Intentions Towards Online Home Services Applications.* Journal of Global Information Management. https://doi.org/10.4018/JGIM.326547 | **Abstract only** (via Crossref metadata; publisher page rate-limited). Article is CC BY 3.0. |
| 2 | Urban Company Limited — Prospectus (15 Sep 2025), NSE archives. https://nsearchives.nseindia.com/corporate/FP_INE0CAZ01013_15SEP2025.pdf | **Full text** (577 pages, extracted locally). Industry statements in it are sourced to a Redseer report *commissioned by the company*. |
| 3 | Bagui & Aggarwal (2026). *Maximising Rooftop Solar Performance by Enabling a Robust O&M Ecosystem.* CEEW. https://www.ceew.in/publications/how-big-is-india-residential-rooftop-solar-maintenance-market | **Overview, key insights and executive summary** on the web page (full PDF not read). |
| 4 | NITI Aayog (2022). *India's Booming Gig and Platform Economy: Perspectives and Recommendations on the Future of Work.* https://www.niti.gov.in/node/375 | **Full report text** rendered on the page. |
| 5 | Elias & Gómez (2025). *Digital platforms as institutional actors in the Global South – Evidence from India's informal sector.* Digital Geography and Society. https://doi.org/10.1016/j.diggeo.2025.100146 | **Title/metadata only.** ScienceDirect blocked automated access and no abstract was available via Crossref or OpenAlex. **We draw no findings from it** until someone reads it. |

---

## 1. Consumer trust and repeat use of home-service apps (JGIM, 2023)

**Verified (abstract):** Survey of **357 respondents in India**, analysed with PLS-SEM. Trust in the
home-service app was influenced by **utilitarian value** and **social value**, *not* hedonic value.
Trust in the app led to **repurchase intention, commitment and sharing intention**. Trust in the
*user community* affected sharing intention but not repurchase intention.

| Product implication | Basis | Validation experiment |
|---|---|---|
| Lead with functional value — visit fee before booking, itemised estimates, approval before extra work, a record of every repair — rather than entertainment. | **Evidence-backed** (utilitarian value → trust), though a stated-intention survey, not behaviour. | Track estimate-approval rate, cancellation rate and repeat-booking rate in the admin metrics; interview 15 pilot customers on why they rebooked or didn't. |
| Don't build community/social features (public reviews feed, forums) to drive repeat use in V1. | **Hypothesis** (community trust didn't predict repurchase in this sample). | Revisit after 100+ completed jobs; A/B a "reviews from your area" module only if repeat rate stalls. |
| Make trust visible in product mechanics (timeline, warranty, complaint path) rather than claims. | **Hypothesis** derived from the trust → repurchase link. | Compare repeat rate of customers who opened their timeline/passport vs those who didn't (correlational; treat cautiously). |

## 2. Market structure and platform operations (Urban Company prospectus, 2025)

**Verified (prospectus text):**
- The prospectus states that the Indian home-services market "has traditionally been dominated by
  unorganized local vendors and suffers from inconsistencies in availability, pricing, quality, and
  post-service support" (p. 26; sourced to a company-commissioned Redseer report).
- It reports **6.78 million annual transacting consumers** (FY2025) and **47,833 average monthly
  active service professionals** (FY2025), defined in the document (pp. 16, 41–45).
- It describes reliance on marketing, cross-sell and **reactivation campaigns to drive repeat
  engagement** (pp. 168–169), and lists attracting/retaining service professionals — including
  training and their level of satisfaction — as a key risk (p. 43).
- It flags **worker-classification risk** (possible social-insurance obligations if service
  professionals are reclassified) (p. 54).

| Product implication | Basis | Validation experiment |
|---|---|---|
| Differentiate on consistency: published visit fees, scheduled windows only when a professional is actually available, post-service warranty and a complaint path. | **Evidence-backed** that inconsistency is a recognised market problem (vendor-commissioned source; treat as directional). | Measure complaint rate and "no professional available" windows per area during the pilot. |
| Repeat business needs product reasons (maintenance passport, service reminders, "Book again"), not only discounts. | **Hypothesis** — the prospectus shows repeat engagement matters; it doesn't show passports work. | Track `repeat_booking_started` from reminders vs elsewhere; compare 90-day repeat rate for customers with ≥1 appliance recorded. |
| Professional supply is a core risk: transparent earnings, no-penalty declines, and fair disputes are retention tools. | **Evidence-backed** that supply retention is material for an incumbent; our specific mechanisms are a **hypothesis**. | Monthly survey + 30/60-day retention of pilot professionals; payout-dispute count. |
| Keep the professional relationship legally reviewed (independent contractor vs employee). | **Evidence-backed** risk disclosure. | Legal review before launch (see launch checklist). |

**We do not use** the prospectus's market-size projections as a business case: they come from a
report commissioned by an interested party and describe a different, much larger business.

## 3. Rooftop solar after-sales (CEEW, 2026)

**Verified (web page):**
- Residential rooftop solar exceeded **10 GW** installed capacity as of April 2026, with **more than
  3 million households**; the government target is **10 million households (30 GW) by 2027**.
- From consultations with **60+ RTS vendors** across several states: the PM Surya Ghar scheme
  mandates five years of free maintenance but **scope and visit frequency are not clearly defined**;
  **cleaning is typically not included** in free AMCs; service is **predominantly reactive** (on the
  consumer's request); and **willingness to pay for O&M after five years is limited**.
- Irregular maintenance can significantly reduce household savings; the report estimates an annual
  addressable market of about **INR 1,900 crore for cleaning** and **INR 5,000 crore for bundled O&M**
  at ~10 GW, with **over 70% concentrated in five states**.

| Product implication | Basis | Validation experiment |
|---|---|---|
| Offer solar *cleaning, inspection and coordination* (not panel/inverter repair claims), and record it in the passport. | **Evidence-backed** gap in cleaning and scheduled service. | Pilot in one area; measure solar bookings per 100 solar-owning customers and repeat cleaning cadence. |
| Use reminders to move solar care from reactive to scheduled. | **Hypothesis** (the report identifies reactivity; reminders working is untested). | Compare repeat cleaning rate for customers with a solar asset + reminder vs without. |
| Be explicit that installer/manufacturer warranties remain separate; help coordinate. | **Evidence-backed** (unclear AMC scope causes confusion). | Track solar-related complaints tagged "warranty confusion". |
| Expect willingness-to-pay to be the constraint; price simply and test. | **Evidence-backed** (limited paid-AMC uptake) — price points are a **hypothesis**. | Test two visit-fee levels in different weeks; measure conversion from coverage check to booking. |

The market-size estimates are CEEW's model outputs; we don't present them to customers.

## 4. Gig and platform workers (NITI Aayog, 2022)

**Verified (report text):**
- The gig workforce is estimated at **68 lakh (6.8 million) in 2019–20** and **77 lakh (7.7
  million) in 2020–21**, projected to reach **about 2.35 crore (23.5 million) by 2029–30**.
- The report notes workers may face stress from **algorithmic management practices and
  performance evaluation on the basis of ratings**, and calls for balancing platform growth with
  **decent working conditions and well-being**.
- Workers (especially those with another job) **value transparent, timely and assured payments**;
  the report recommends **income support / assured minimum earnings** and social security measures.

| Product implication | Basis | Validation experiment |
|---|---|---|
| Show area, window, problem and **guaranteed visit earnings before acceptance**; itemise every payout with the platform share. | **Evidence-backed** (transparent, assured payments valued). | Payout-dispute rate; professional NPS-style survey (internal, not published). |
| No penalty for declining; ratings hidden until 5 reviews; complaints reviewed by people before action. | **Evidence-backed** concern about ratings-based evaluation; specific thresholds are a **hypothesis**. | Track decline rate vs retention; review every deactivation decision. |
| Plan for social-security contributions/insurance as regulation evolves. | **Evidence-backed** policy direction. | Legal/accounting review before scaling. |

## 5. Platforms in India's informal sector (Digital Geography and Society, 2025)

No findings used — the article could not be read in this session. **Action:** a team member with
access should read it and add verified findings here before any decision cites it.

---

## Hypotheses to validate with pilot data

Each maps to events already tracked (see `lib/analytics`) or metrics in **Admin → Metrics**.

| Hypothesis | Signal | Data source |
|---|---|---|
| The 3D home increases service discovery. | Share of `service_category_selected` with `surface=explorer`; booking starts after explorer use vs list. | `home_explorer_opened`, `service_category_selected`, `booking_started` |
| Honest availability (only bookable windows) increases completed bookings. | Completion rate; cancellation rate; share of windows shown as "no professional". | Admin metrics; slot availability logs |
| Transparent itemised estimates reduce disputes. | Estimate approval rate; disputes per completed job; pricing complaints. | `estimate_approved/rejected`, complaints by category |
| Tenant–landlord approvals make repairs easier to coordinate. | Time from estimate to decision for LANDLORD vs REQUESTER bookings; cancellation rate for rented homes. | `estimate_approvals`, booking `cost_approval` |
| Maintenance reminders generate repeat bookings. | `repeat_booking_started` from asset pages; 90-day repeat rate with vs without assets. | Analytics + bookings |
| Pincode-first coverage + waitlist reveals where to expand next. | `unavailable_area_encountered` and waitlist counts by pincode/area. | Admin → Cities & areas |

**Rule:** a hypothesis is only "confirmed" with a pre-stated threshold and a minimum sample (the
admin metrics refuse to show values below 5 observations). Small pilots are directional.
