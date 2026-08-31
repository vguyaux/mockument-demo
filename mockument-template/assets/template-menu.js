// Committed Mockument menu seed.
// Edit this file when the demo's main menu or sub-menu should change in Git.
// After committing/pushing, GitHub Pages and every local git pull will get the same menu.
(function () {
  "use strict";

  window.MOCKUMENT_TEMPLATE_MENU = {
    version: "2026-08-31-01",

    // When this version changes, old browser-only menu state is discarded once.
    // This lets the committed file become the source of truth for demos.
    resetLocalStateOnVersionChange: true,

    app: {
      name: "Application Name"
    },

    pages: [
      // Example structure:
      // {
      //   id: "customers",
      //   name: "Customers",
      //   route: "/customers",
      //   built: true,
      //   children: [
      //     { id: "customer-detail", name: "Customer detail", route: "/customers/detail", built: true },
      //     { id: "customer-import", name: "Customer import", route: "/customers/import", built: false }
      //   ]
      // }
    ]
  };
})();
