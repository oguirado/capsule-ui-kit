# AI operability

Use visible labels, roles, stable IDs and `data-semantic-anchor` attributes. The starter exposes workspace/commands, workspace/theme, hello/press, notes/draft and notes/add controls. Every disabled action remains understandable from its visible state; Terminal explicitly reports that its backend is disconnected.

The optional public registry export is `capsule-ui-kit/registry`. It provides createControlRegistry, matchControlFamily, canonicalizeStateJson, computeStateDigests and validateAgentLaneFrame. See `books/control-registry.md` and the local declaration/source contract before constructing records. Consumers inject their registry into capsule views; a DOM selector does not establish backend authority.

Hidden/folded controls must have null boxes, stale epochs require revalidation, and a reviewed producer is required for canonical state export. Do not expose hidden application state merely to make automation easier. Human keyboard operation and agent targeting must refer to the same visible controls. The starter has no privileged AI lane or generic command transport.

The boot proof exercises the built renderer without DevTools/CDP. Kit semantic-registry tests independently cover stale identity, unavailable controls and modal scope. Passing these functional checks is not a claim about commercial appeal or assistive technology certification.
