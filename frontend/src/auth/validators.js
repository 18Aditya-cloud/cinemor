// Returns an error message, or '' when the value is fine.
export function validateEmail(value) {
  const email = String(value || '').trim();
  if (!email) return 'Enter your email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Enter a valid email address, like name@example.com.';
  return '';
}
