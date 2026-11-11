/**
 * Become-instructor form validity (Module 3, Phase 2).
 *
 * Pure, client-safe helpers — no server imports, so the form page can
 * use them and node tests can exercise the exact logic that enables
 * the Submit button. The button stays DISABLED until every required
 * field validates, including both files being present with no file
 * errors.
 *
 * Required for submit: full name, a valid email, area of expertise,
 * years of experience, "Why do you want to teach?" (message), a
 * LinkedIn profile URL, a CV file, a demo recording file, and "Why do
 * you think you are a good fit for this role?" (whyGoodFit). Phone,
 * GitHub and "Anything Additional" are optional.
 *
 * Note the deliberate asymmetry with the server: expertise /
 * experience / message are required here (the UI demands them) but
 * stay optional in the zod schema and the service (see the schema
 * comment) — the client is stricter than the server for those three
 * legacy fields, never looser.
 */

export interface ApplicationFormValidityInput {
  name: string;
  email: string;
  expertise: string;
  experience: string;
  message: string;
  linkedinUrl: string;
  githubUrl?: string;
  whyGoodFit: string;
  hasCvFile: boolean;
  hasDemoFile: boolean;
  cvError: string;
  demoError: string;
}

export function isValidApplicationEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** A profile URL must be http(s) and on the expected host (linkedin.com / github.com). */
export function isValidProfileUrl(value: string, host: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === host || url.hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

/** True only when every required field validates — this is what enables Submit. */
export function isApplicationFormValid(input: ApplicationFormValidityInput): boolean {
  if (input.name.trim() === '') return false;
  if (!isValidApplicationEmail(input.email)) return false;
  if (input.expertise.trim() === '') return false;
  if (input.experience.trim() === '') return false;
  if (input.message.trim() === '') return false;
  if (!isValidProfileUrl(input.linkedinUrl, 'linkedin.com')) return false;
  const github = (input.githubUrl ?? '').trim();
  if (github !== '' && !isValidProfileUrl(github, 'github.com')) return false;
  if (input.whyGoodFit.trim() === '') return false;
  if (!input.hasCvFile || input.cvError !== '') return false;
  if (!input.hasDemoFile || input.demoError !== '') return false;
  return true;
}
