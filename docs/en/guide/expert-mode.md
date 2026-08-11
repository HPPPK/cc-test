# Expert Mode

Expert Mode lets the desktop app run a chat session with a reusable Expert Pack: a role, instructions, Skills, forms, output templates, and tool guidance that belong together.

## Start an expert session

1. Open or create a desktop chat session.
2. Open the expert picker next to the composer and select an expert.
3. The app enters Expert Mode and sends a visible welcome question. The expert prompt, Skills, and templates are injected by the server and are not added as visible user messages.
4. Enter the task context, product direction, or attach materials the expert should use.

Entering Expert Mode does not grant additional computer or network permissions. The real tool set remains the one available in the current desktop runtime.

## What an Expert Pack contains

An Expert Pack is an importable/exportable ZIP. Its source package can contain:

- expert definition, description, category, and tags;
- system prompt and optional intake form;
- package-local Skills;
- tool declarations and permission notes;
- optional output protocol and fixed HTML template.

Use Expert settings to inspect, import, export, and edit packs, and to manage categories and expert profile content. Categories are configurable rather than fixed to a small built-in list.

## Tools and web research

A pack declares the tools it recommends. The runtime exposes only the tools that are genuinely available for the current turn; a declaration cannot enable a missing tool or bypass normal permissions.

Experts that need public web evidence should prefer **Playwright**. It opens pages through locally managed Chromium/Playwright and returns visible text, actual links, screenshot paths, and restriction or failure details to the model.

- Login walls, CAPTCHA, regional restrictions, robots rules, and rate limits must be recorded as access limitations.
- An inaccessible page must not be presented as verified evidence.
- If web discovery is unavailable for the current model/runtime, the expert should ask for links, screenshots, exported pages, or internal materials.
- Playwright cannot guarantee automated access to every third-party website; follow applicable site terms and rules.

### User-authorized Chrome or Edge (optional)

A pack may declare an optional user-authorized browser connection. Managed Chromium remains the default even for that pack. A connection is made only after you explicitly choose Chrome or Edge while entering the Expert, enter a **local** debugging endpoint, and acknowledge the permission.

- Only local HTTP endpoints on `localhost`, `127.0.0.1`, or `::1` are accepted. Remote endpoints, proxies, credentials, and user-profile paths are not supported.
- The app does not scan, copy, or directly open the default Chrome or Edge profile you use every day. Start a dedicated debugging browser window, then log in or complete any verification yourself there.
- The Expert can read and operate tabs in that dedicated debugging browser. Do not place day-to-day or sensitive tabs in it. Leaving Expert Mode clears the session connection setting.
- This does not bypass CAPTCHA, login walls, or site restrictions. Complete a verification yourself in the visible window or record the source as an evidence gap.

## Skill discovery

The Expert management UI can search for public Skill links, including QClaw results. It returns links only; it does not automatically download, import, or run third-party Skills.

Online discovery requires a Tavily or Brave API Key in Web Search settings. A missing configuration is shown explicitly and does not prevent local use of already installed Expert Packs.

## Commercialization research report expert

The first bundled Expert Pack, **New Product Commercialization Research Report**, includes business-rule input, research Skills, product/market/channel subagents, an independent evidence review, a fixed HTML template, and report-output guidance.

Recommended flow:

1. Provide the product direction, market scope, launch platform, and available material.
2. Answer the expert's clarification questions.
3. Review research findings, evidence gaps, and validation hypotheses.
4. Confirm the output location before asking the expert to write the final HTML report.

The fixed template keeps report structure consistent. When evidence is insufficient, the report should preserve a visible hypothesis or evidence gap instead of presenting speculation as fact.

## Boundaries

- Prompts and Skills guide the model but do not replace human fact checking.
- Subagent and evidence-review outputs must be correctly incorporated into the final report; many sources do not automatically mean diverse sources.
- A historical session that failed to persist its Expert Runtime binding must not be treated as a safe active Expert session. New versions validate that binding when Expert Mode is entered.
- Confirm the target directory and file name before writing a local report.
