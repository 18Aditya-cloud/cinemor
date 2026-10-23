// Tiny className joiner: cx('a', cond && 'b') -> 'a b'
export default function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
