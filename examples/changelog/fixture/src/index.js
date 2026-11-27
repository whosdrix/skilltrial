export function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function capitalize(input) {
  return input.charAt(0).toUpperCase() + input.slice(1)
}
