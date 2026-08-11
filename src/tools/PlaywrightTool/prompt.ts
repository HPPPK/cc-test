export const PLAYWRIGHT_TOOL_NAME = 'Playwright'

export const PLAYWRIGHT_DESCRIPTION = `
- Uses the desktop app's managed Playwright Chromium to perform the exact public-web browser actions supplied in actions, in order
- Actions are visible to the user by default. The supported surface includes navigation/history, tabs, form interaction, keyboard/mouse actions, selectors and waits, DOM inspection, scrolling, screenshots, and returned action traces. For any official Playwright API not represented by a named action, use one {"type":"script","script":"..."} action.
- This tool is a generic browser operator, not a research, SEO, or source-ranking tool. Decide what to search, which links matter, and what evidence supports a conclusion in the active Skill or user instructions
- The script action receives the current managed Chromium session's real official Playwright objects: page, context, browser, pages(), and a playwright namespace containing chromium, firefox, webkit, devices, selectors, and request. Use normal Playwright methods directly, for example await page.locator('#search').click(), await context.newPage(), or await playwright.request.newContext(). It is not a separate browser and preserves the same managed session
- If a page shows login, CAPTCHA, robots, 403/429, or a regional restriction, record the returned URL and limitation. Do not treat it as evidence and do not attempt to bypass it
- Consecutive Playwright calls in the same chat/session keep the same managed Chromium page. You may split a long interaction into navigate, then fill, then press/click, then extract; do not start over at about:blank
- For web navigation, filling, clicking, key presses, scrolling, reading, and screenshots on pages already opened by Playwright, continue using Playwright. Do not switch to mcp__computer-use__*, Bash, PowerShell, npx playwright, or a homemade browser script merely to click the page
- Always pass one "actions" array. Named-action example JSON: {"actions":[{"type":"navigate","url":"https://www.baidu.com/"},{"type":"type","selector":"#kw","text":"productivity software","delay_ms":40},{"type":"press","selector":"#kw","key":"Enter"},{"type":"wait_for_selector","selector":"body","state":"visible"},{"type":"extract","selector":"body"}],"visible":true}. Raw API example: {"actions":[{"type":"script","script":"const tab = await context.newPage(); await tab.goto('https://example.com/'); return { title: await tab.title(), links: await tab.locator('a').count() }"}],"visible":true}. Never send top-level "action" or "url" fields.
`

export function getPlaywrightPrompt(): string { return PLAYWRIGHT_DESCRIPTION }
