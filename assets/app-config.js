/* ==========================================================================
   Honest Mockument — app configuration
   ONE place to describe the app being specified and its proposed menu.
   Every page reads this: edit here, and every page updates.

   What follows is a WORKED EXAMPLE, deliberately generic: an internal
   request-and-approval app, the kind almost every organisation has in some
   form. Replace it with your own app — names, roles, processes and menu —
   and the rest of the mockument follows.
   ========================================================================== */

window.SPEC_APP = {
  /* --- the app itself (name, domain, who uses it) --- */
  name: "Sample App",
  tagline: "A worked example — replace it with yours",
  domain: "Requests and approvals",
  version: "0.3 draft",
  updated: "2026-08-18",
  usedBy: [
    { name: "Approver",      isAgent: false, note: "Decides what is waiting in their own queue." },
    { name: "Team lead",     isAgent: false, note: "Sees every queue in their team; can reassign, cannot decide for someone else." },
    { name: "Auditor",       isAgent: false, note: "Read-only across the organisation; exports evidence of decisions." },
    { name: "Routing agent", isAgent: true,  note: "Applies the routing rules overnight and places requests in queues." }
  ],

  /* --- processes and their steps --- */
  processes: [
    {
      id: "PROC-01",
      name: "Getting a request decided",
      remembered: "Which requests have been read, the last queue a team lead opened, and the last filter used.",
      steps: [
        { id: "STEP-01", name: "Raise a request",            pages: ["page-requests.html"] },
        { id: "STEP-02", name: "Decide what is waiting",     pages: ["page-approvals.html"] },
        { id: "STEP-03", name: "Tell the requester",         pages: ["page-requests.html"] }
      ]
    },
    {
      id: "PROC-02",
      name: "Keeping the routing rules current",
      remembered: "The last rule opened, and whether the list was filtered to active rules only.",
      steps: [
        { id: "STEP-04", name: "Review what the rules are doing", pages: ["page-approvals.html"] },
        { id: "STEP-05", name: "Change a threshold",              pages: ["page-settings.html"] }
      ]
    }
  ],

  /* --- the proposed menu of the real app ------------------------------
     built:false destinations still appear, marked unfinished: a gap you
     can see is worth more than a tidy diagram.                           */
  menu: [
    { id: "home",      name: "Home",      href: "page-home.html",      built: false },
    { id: "requests",  name: "Requests",  href: "page-requests.html",  built: false },
    { id: "approvals", name: "Approvals", href: "page-approvals.html", built: true  },
    { id: "reports",   name: "Reports",   href: "page-reports.html",   built: false },
    { id: "settings",  name: "Settings",  href: "page-settings.html",  built: false }
  ],

  /* --- workflows: named pieces of real work, walkable end to end --- */
  workflows: [
    { id: "WF-01", name: "Decide a high-value request", href: "workflow-decide-request.html", built: true },
    { id: "WF-02", name: "Send a request back for detail", href: "workflow-send-back.html", built: false }
  ],

  /* --- shared components: specified once, referenced by pages --- */
  components: [
    { id: "CMP-01", name: "Stat strip",     note: "Row of interactive summary tiles. Selecting a tile filters the list below it." },
    { id: "CMP-02", name: "Priority badge", note: "High / Medium / Low, with the same colours everywhere in the app." },
    { id: "CMP-03", name: "Filter toolbar", note: "Search, a segmented state control, and saved views." }
  ],

  /* --- registers assembled from the pages --- */
  reference: [
    { name: "App map",         href: "app-map.html" },
    { name: "Open questions",  href: "questions.html" },
    { name: "Data dictionary", href: "data-dictionary.html" },
    { name: "Blank template",  href: "page-template.html" }
  ],

  /* --- the method itself, always one click away --- */
  docs: [
    { name: "The Honest Mockument", href: "honest-mockument.html" },
    { name: "The data layer",       href: "data-layer.html" }
  ],

  /* --- every mockument page the registers should scan --- */
  specPages: ["page-approvals.html", "page-template.html"]
};
