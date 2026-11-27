import assert from 'node:assert/strict'
import { test } from 'node:test'
import { capitalize, slugify } from '../src/index.js'

test('slugify', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world')
})

test('capitalize', () => {
  assert.equal(capitalize('tiny'), 'Tiny')
})
