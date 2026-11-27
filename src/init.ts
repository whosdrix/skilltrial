export const TEMPLATE = `# skilltrial task file. Docs: https://github.com/whosdrix/skilltrial#task-file
version: 1

agent:
  type: claude-code
  model: sonnet

runs: 5          # runs per arm, per task. More runs, tighter intervals.
concurrency: 2
timeout: 10m

tasks:
  - id: fizzbuzz-cli
    prompt: |
      Write fizzbuzz.js, a Node script that prints FizzBuzz from 1 to the number
      given as its first argument. Add a test file that runs with node --test.
    checks:
      - name: prints the right output
        run: test "$(node fizzbuzz.js 15 | tail -1)" = "FizzBuzz"
      - name: has tests that pass
        run: node --test
      - file: fizzbuzz.js
        absent: console.error

  # A task that starts from your own code and uses a model as the grader.
  # - id: landing-page
  #   fixture: ./fixtures/vite-app
  #   setup: npm ci
  #   prompt: Build a landing page for a coffee subscription in src/App.tsx.
  #   checks:
  #     - run: npm run build
  #     - judge: |
  #         Does the page look designed rather than default? Look for a clear
  #         hierarchy, consistent spacing, and a real color palette.
  #       files: ["src/**/*.tsx", "src/**/*.css"]
  #       pass: 7
`
