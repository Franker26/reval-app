export function initials(name = '') {
  return name.slice(0, 2).toUpperCase() || 'AC'
}

export function avatarColor(seed = '') {
  let hash = 0
  for (const char of seed) hash = char.charCodeAt(0) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 46%)`
}
