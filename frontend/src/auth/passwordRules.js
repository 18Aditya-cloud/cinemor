/**
 * The password guide shown on the Log in and Sign up pages.
 * A password is "strong" when every rule below is met. To change the guide, edit this list.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { id: 'upper', label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number (0-9)', test: (p) => /\d/.test(p) },
  { id: 'symbol', label: 'One special character (! @ # $ % ...)', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

// These match the backend's own password check (app/schemas/auth.py, validate_password_strength): 12 to 128 characters,
// with an uppercase letter, a lowercase letter, a number and a special character. Settings uses the same rules.
export const ACCOUNT_PASSWORD_RULES = PASSWORD_RULES;

// Index = number of rules met.
export const STRENGTH_LABELS = ['Too weak', 'Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
export const STRENGTH_COLORS = ['#ef4444', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];

export function checkPassword(password, rules = PASSWORD_RULES) {
  const results = rules.map((rule) => ({ id: rule.id, label: rule.label, met: rule.test(password) }));
  const score = results.filter((r) => r.met).length;
  return { results, score, allMet: score === rules.length };
}
