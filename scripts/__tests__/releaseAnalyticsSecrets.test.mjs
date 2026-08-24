import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowPath = path.resolve(process.cwd(), '.github/workflows/release.yml')

describe('release analytics secrets', () => {
  it('passes PostHog settings to the Electron build step that runs prebuild', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8')
    const buildStep = workflow.slice(workflow.indexOf('      - name: Build Electron App'))

    expect(buildStep).toContain('POSTHOG_PROJECT_API_KEY: ${{ secrets.POSTHOG_PROJECT_API_KEY }}')
    expect(buildStep).toContain('POSTHOG_HOST: ${{ secrets.POSTHOG_HOST }}')
  })
})
