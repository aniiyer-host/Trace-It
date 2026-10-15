export type EmailAddressIssue = 'invalid' | 'placeholder';

const PLACEHOLDER_DOMAINS = new Set([
  'localhost',
  'example.com',
  'example.net',
  'example.org',
  'traceit.dev',
]);

export const getEmailAddressIssue = (email: unknown): EmailAddressIssue | undefined => {
  if (
    typeof email !== 'string' ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)
  ) {
    return 'invalid';
  }

  const domain = email.toLowerCase().split('@').at(-1) ?? '';
  if (
    PLACEHOLDER_DOMAINS.has(domain) ||
    domain.endsWith('.localhost') ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.test') ||
    domain.endsWith('.example')
  ) {
    return 'placeholder';
  }

  return undefined;
};
