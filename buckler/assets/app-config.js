/* ==========================================================================
   Buckler — mockument configuration

   This is a CONVERSION, not a new specification: an existing page-by-page
   functional specification for a real product, re-expressed in the mockument
   format so the two can be compared. Nothing here was invented — where the
   source specification is silent, the pages say so and name an owner.

   Source: the product team's functional specification, five pages plus four
   reference sections. Converted 2026-08-18.
   ========================================================================== */

window.SPEC_APP = {
  name: "Buckler",
  tagline: "Converted from an existing functional specification",
  domain: "Advisor book supervision and due diligence",
  version: "0.1 converted",
  updated: "2026-08-18",
  usedBy: [
    { name: "Advisor",           isAgent: false, note: "Owns a book of securities; acts on what fired and records the review." },
    { name: "Advisor team lead", isAgent: false, note: "Switches between the teams and books they cover." },
    { name: "Compliance",        isAgent: false, note: "Reads the audit trail of reviews and documents." },
    { name: "Evaluation run",    isAgent: true,  note: "Overnight and monthly runs that produce alerts, scores and screen membership." }
  ],

  processes: [
    {
      id: "PROC-01",
      name: "Daily book supervision",
      remembered: "Which team was last selected, and what has changed since last login.",
      steps: [
        { id: "STEP-01", name: "See what needs attention today",     pages: ["page-home.html"] },
        { id: "STEP-02", name: "Review what fired and decide",       pages: ["page-monitoring.html"] },
        { id: "STEP-03", name: "Record the due diligence review",    pages: ["page-due-diligence.html"] }
      ]
    },
    {
      id: "PROC-02",
      name: "Working the book",
      remembered: "Saved personal views, pinned tabs, favourites and the last active filter set.",
      steps: [
        { id: "STEP-04", name: "Inspect and filter the whole book",  pages: ["page-book-of-business.html"] },
        { id: "STEP-05", name: "Take the book out of the app",       pages: ["page-book-of-business.html"] }
      ]
    },
    {
      id: "PROC-03",
      name: "Answering a question about the book",
      remembered: "Pinned custom widget layouts, per advisor.",
      steps: [
        { id: "STEP-06", name: "Build a view that answers it",       pages: ["page-analytics.html"] }
      ]
    }
  ],

  menu: [
    { id: "home",          name: "Home",             href: "page-home.html",             built: true },
    { id: "book",          name: "Book of Business", href: "page-book-of-business.html", built: true },
    { id: "monitoring",    name: "Monitoring",       href: "page-monitoring.html",       built: true },
    { id: "due-diligence", name: "Due Diligence",    href: "page-due-diligence.html",    built: true },
    { id: "analytics",     name: "Analytics",        href: "page-analytics.html",        built: true },
    { id: "settings",      name: "Settings",         href: "page-settings.html",         built: false }
  ],

  workflows: [
    { id: "WF-01", name: "Clear a SEV1 alert", href: "workflow-clear-alert.html", built: true },
    { id: "WF-02", name: "Build and pin a personal view", href: "workflow-personal-view.html", built: false }
  ],

  components: [
    { id: "CMP-01", name: "Header strip",   note: "Advisor or team identity plus AUM and position counts. Repeated on Home, Book of Business and Analytics." },
    { id: "CMP-02", name: "Stat tile",      note: "Interactive summary tile; selecting it opens a filtered destination." },
    { id: "CMP-03", name: "Severity badge", note: "SEV1 red, SEV2 burnt orange, informational counts in neutral slate." },
    { id: "CMP-04", name: "Filter toolbar", note: "Search, quick chips, segmented controls, filter builder, saved views and pinned tabs. Specified once for the whole app." },
    { id: "CMP-05", name: "Securities table", note: "Sortable table with fixed and default columns, row click-through, and column customisation." }
  ],

  reference: [
    { name: "App map",         href: "app-map.html" },
    { name: "Open questions",  href: "questions.html" },
    { name: "Data dictionary", href: "data-dictionary.html" }
  ],

  docs: [
    { name: "The Honest Mockument", href: "../honest-mockument.html" },
    { name: "The data layer",       href: "../data-layer.html" },
    { name: "The generic sample",   href: "../index.html" }
  ],

  specPages: [
    "page-home.html", "page-book-of-business.html", "page-monitoring.html",
    "page-due-diligence.html", "page-analytics.html"
  ]
};
