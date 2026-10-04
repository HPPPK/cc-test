# Sources and license notes

- Anthropic, [frontend-design Skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design), retrieved 2026-08-26. The upstream skill is included verbatim under `skills/frontend-design/` with its bundled Apache-2.0 `LICENSE.txt`; see `THIRD_PARTY_NOTICES.md`.
- The package-specific `prototype-fidelity-workflow`, `prototype-visual-quality-gate` and system prompt are original integrations for cc-jiangxia. They adapt the upstream design principles to this Expert's product-prototype, evidence and local-rendering boundaries; they do not include third-party page templates, screenshots, logos or implementation code.

## Multi-screen HTML guidance — 2026-09-11

The following official pages were retrieved as public HTML/text with HTTP 200 on 2026-09-11. The bound prototype-fidelity-workflow Skill embeds our own compact teaching examples and original screen maps directly in its body, so the model receives them with the Skill. No additional global Skill installation or inaccessible reference-file read is required.

| Reference | Retrieved content used | Integration |
| --- | --- | --- |
| https://carbondesignsystem.com/components/file-uploader/usage/ | File selection, description, file item/removal and upload states | Input, processing and recovery screen responsibilities |
| https://carbondesignsystem.com/components/data-table/usage/ | Table anatomy, toolbar, search/sort/pagination | Session list controls only where data needs them |
| https://ui.shadcn.com/blocks?category=dashboard | Dashboard shell example with sidebar, header and content components | Shared shell and task-focused content; no React implementation copied |
| https://tailwindcss.com/docs/installation/play-cdn | Browser CDN setup and development-only positioning | Honest prototype versus production boundary |

未进行这些参考页面的浏览器截图或颜色实测。These reads establish documentation content only, not visual inspection, mobile testing, asset permission for unrelated photos, or proof that a future Expert session browsed those pages.

The photo-tool eight-screen and document-product eight-section examples, palette choices and HTML marker conventions are original cc-jiangxia instructional examples, not templates downloaded from those sites. Their hypothetical capabilities are not facts about a user's product. Existing Anthropic frontend-design Skill and license remain unchanged.
