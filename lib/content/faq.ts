import { cancellationPolicy, completionPolicy, payoutPolicy } from "@/lib/config/site";

export const faqs: { q: string; a: string; audience?: "customer" | "renter" | "technician" | "property" }[] = [
  {
    q: "What do I pay before the professional arrives?",
    a: "Nothing online. You see the visit (inspection) fee before booking and pay the professional after the service by UPI or cash. Online payment isn't available yet.",
  },
  {
    q: "Can the price change after I approve an estimate?",
    a: "No. An approved estimate can't be edited. If more work is needed, the professional sends a separate estimate that you can approve or decline.",
  },
  {
    q: "I rent my home. Can I still book?",
    a: "Yes. Choose “I rent this home” and decide who approves costs — you, or your landlord via a secure link. You can approve small repairs yourself up to a limit you set.",
    audience: "renter",
  },
  {
    q: "What if I'm not home during the visit?",
    a: "Share the booking with a household member so they can follow it, and if you give them “manage” access they can approve estimates up to a limit you choose.",
  },
  {
    q: "How do cancellations work?",
    a: cancellationPolicy.summary,
  },
  {
    q: "What does the workmanship warranty cover?",
    a: "Each service shows its own warranty period and exclusions before you book and on your invoice. It covers the work done in that job, not the whole appliance, and it isn't a manufacturer warranty.",
  },
  {
    q: "Do you serve my area?",
    a: "Check your pincode on the home page. We only take bookings in neighbourhoods where we have enough professionals; elsewhere you can join the waitlist.",
  },
  {
    q: "When is a job marked complete?",
    a: `When you confirm it. The professional submits completion details, and you either confirm or raise an issue. If you don't respond within ${completionPolicy.autoConfirmAfterHours} hours, operations may close it after reviewing the job.`,
  },
  {
    q: "Is there live tracking of the professional?",
    a: "Not yet. You'll see when they set off and your scheduled window. We won't show a map or arrival time we can't verify.",
  },
  {
    q: "Are professionals background-verified?",
    a: "Operations reviews each professional's profile before they can take jobs. Formal ID and background verification through a third-party provider isn't integrated yet, so we don't claim it.",
  },
  {
    q: "How are professionals paid?",
    a: `${payoutPolicy.summary} Payouts are made ${payoutPolicy.payoutCycle.charAt(0).toLowerCase()}${payoutPolicy.payoutCycle.slice(1)}.`,
    audience: "technician",
  },
  {
    q: "Can a landlord or property manager see my other bookings?",
    a: "No. A landlord invited to one booking sees only that booking. Tenants in managed properties see only their own unit — never other tenants' requests.",
    audience: "renter",
  },
];
