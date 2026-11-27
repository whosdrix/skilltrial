let input = ''
for await (const chunk of process.stdin) input += chunk
const score = input.includes('42') ? 9 : 3
console.log(`thinking... {"score": ${score}, "reason": "checked answer.txt"}`)
