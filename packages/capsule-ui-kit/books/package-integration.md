# Package integration boundary

The package export map is the supported consumer surface. Component subpaths expose default Vue components and explicit public prop declarations; pure services use named exports. The root groups services as projection, layout, registry and scheduler namespaces. Consumer build aliases must resolve the exact export map, including conditional default targets. Peer dependencies are installed by the consumer. The workspace node_modules link is a development resolver aid and is excluded from the package files list and portability test.

DockWorkspace accepts an optional validated defaultProfile plus tabComponents/defaultTabComponent. Missing, corrupt and future layouts use the consumer default. Corrupt and future payloads remain untouched and read-only. No persistence service or profile identity is inferred by the kit.

CapsulePanel accepts placeholderTitle for unbound presentation panels. A missing capsule projection displays unavailable lifecycle rather than suggesting a running backend. The title remains an explicit presentation fallback until the projection supplies the capsule identity.

Projection admission accepts scalar exact money and closed typed money objects containing currency and minor integer fields. Unknown money properties, missing fields and inexact values still reject the complete batch. Browser digests use a portable synchronous SHA-256 implementation checked against native SHA-256 across UTF-8 and padding boundaries. No Node runtime is required by production kit modules.

Verification is through the kit node:test suite, the consumer build/typecheck, and the consumer native lane conformance test. Public component declarations check consumer prop bindings; the existing raw SFC helper implementations are exercised by behavioral and compilation tests, rather than claimed as fully typechecked library internals.

The public theme.css subpath publishes the JSON token contract as both kit and DockWorkspace semantic variables, with the inventoried Dockview vendor mappings. Run tools/generate-theme.py after changing either token JSON file. The consumer loads this external stylesheet before first presentation; root attributes select the committed modes. The integration live test measures computed colors, contrast, density independence and text scaling.
