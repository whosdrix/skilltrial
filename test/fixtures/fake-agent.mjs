import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const skillDir = process.env.SKILLTRIAL_SKILL_DIR
let answer = '41'
if (skillDir && existsSync(join(skillDir, 'SKILL.md'))) {
  const text = await import('node:fs').then((fs) =>
    fs.readFileSync(join(skillDir, 'SKILL.md'), 'utf8'),
  )
  answer = text.includes('compute it twice') ? '42' : '7'
}
writeFileSync('answer.txt', `${answer}\n`)
console.log(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: `wrote ${answer}`,
    num_turns: 2,
    total_cost_usd: answer === '42' ? 0.012 : 0.01,
    usage: { input_tokens: 100, output_tokens: 20 },
  }),
)
