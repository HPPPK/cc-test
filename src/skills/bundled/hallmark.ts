import { parseFrontmatter } from '../../utils/frontmatterParser.js'
import { registerBundledSkill } from '../bundledSkills.js'
import { HALLMARK_FILES, HALLMARK_ORIGIN, HALLMARK_SKILL_MD } from './hallmarkContent.js'

const { frontmatter, content: HALLMARK_BODY } = parseFrontmatter(HALLMARK_SKILL_MD)

export const HALLMARK_SKILL_NAME = 'hallmark'

const DESCRIPTION = typeof frontmatter.description === 'string'
  ? frontmatter.description
  : 'Audit or redesign an interface to remove generic AI-generated visual patterns.'

export const HALLMARK_RUNTIME_ADAPTER = `## Jiangxia runtime adapter

This is a vendored, MIT-licensed Hallmark skill (${HALLMARK_ORIGIN.repository}@${HALLMARK_ORIGIN.revision}). It is a rule-based design and review method, not a pixel-perfect classifier and not evidence that a page is objectively “AI-generated.” Report the concrete named patterns you observed and the screenshot evidence for each finding.

- Do not use Together AI, WebFetch, a hosted browser, or any external design-generation service. When Hallmark refers to WebFetch or a browser, use the application-provided Playwright tool for public pages and the enabled Bash/Playwright path for local HTML.
- For a visual redesign or HTML/CSS fallback, inspect the user-provided screenshot before design work. Separate visible facts from design assumptions. Do not copy a public reference page or invent commercial claims.
- Before writing a UI, choose an explicit visual register, a macrostructure that matches the task, a typography pairing, a restrained colour anchor, and one structural asymmetry. Do not default to a centred hero, a three-card grid, a purple gradient, or generic white cards.
- Before delivering HTML/CSS, render it with Playwright/Chromium at the required viewports, inspect the actual PNGs, and audit the rendered result against the named anti-patterns in references/anti-patterns.md. If a critical or high-confidence tell is present, revise and rerender. A successful static check is not a visual audit.
- For image-generation fallback specifically: HTML/CSS is a browser-rendered visual artifact, not model-generated imagery. Preserve that label in the final response. Do not manufacture a raster image and call it generated.
- Finish with an honest review receipt: visual register, patterns checked, patterns found or ruled out, concrete revision(s), rendered PNG path(s), and remaining uncertainty. Do not merely claim “no AI taste.”
`

export function buildHallmarkPrompt(args: string): string {
  const parts = [HALLMARK_BODY.trimStart(), HALLMARK_RUNTIME_ADAPTER]
  if (args.trim()) {
    parts.push(`## User request\n\n${args.trim()}`)
  }
  return parts.join('\n\n')
}

export function getHallmarkSkillDefinition() {
  return {
    name: HALLMARK_SKILL_NAME,
    description: DESCRIPTION,
    userInvocable: true,
    files: HALLMARK_FILES,
    async getPromptForCommand(args: string) {
      return [{ type: 'text' as const, text: buildHallmarkPrompt(args) }]
    },
  }
}

export function registerHallmarkSkill(): void {
  registerBundledSkill(getHallmarkSkillDefinition())
}
