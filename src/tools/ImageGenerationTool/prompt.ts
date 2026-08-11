export const IMAGE_GENERATION_TOOL_NAME = 'image_generation'

export const IMAGE_GENERATION_TOOL_PROMPT = `Use image_generation when the user asks for a real generated raster image: a visual concept, illustration, product image, mockup, photo, texture, or a visual redesign deliverable.

- For an actual image request, call operation="generate". Do not substitute HTML, CSS, Canvas, an SVG, a browser screenshot, or a placeholder and call it AI-generated imagery.
- User-uploaded images are already passed to the active model as visual input. Inspect them before giving design advice. State what is visible separately from assumptions; use those visible facts to write a faithful generation prompt when a new visual is requested.
- Use operation="preflight" only to diagnose availability or when the user asks whether image generation is configured. An unverified preflight is not a reason to pretend generation succeeded; if the user requested an image, make one real generate attempt.
- This tool resolves the current session's saved Provider credential inside the desktop server. Never ask for, expose, persist, or put an API key in tool arguments.
- On success, report the returned image path. The tool result may include the generated image for visual self-review. On failure, report the real error code and do not create a local fake image.
- When a generate call returns fallback.required=true, the next action is mandatory: call AskUserQuestion with the supplied question and all three supplied choices. Do not begin a Python, HTML/CSS, Canvas, SVG, screenshot, or any other replacement before the user selects a choice.
- If the user selects Python, label the result as a programmatic image, never as GPT/model-generated imagery. If the user selects no fallback, keep the real-image request pending and explain that the Provider image channel must become available.
- If the user selects HTML/CSS for a UI, page, prototype, dashboard, landing page, or design deliverable, first invoke the bundled Skill tool with skill="hallmark". Follow its design flow before writing. Then use Playwright to render real PNGs, invoke Hallmark in audit mode on those PNGs, revise critical/high-confidence named anti-patterns, and rerender. Report the named findings and screenshot paths; never make the uncheckable claim that a page has “no AI taste.”
- HTML/CSS fallback remains a browser-rendered visual artifact, never a real generated image. For a non-interface image request where HTML/CSS cannot honestly satisfy the request, state that limitation instead of forcing a fake page.
`

export const DESCRIPTION = 'Generate a real raster image through the current desktop Provider, or verify whether the Provider has an image-generation model.'
