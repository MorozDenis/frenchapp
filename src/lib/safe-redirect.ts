/**
 * Constrains a post-sign-in redirect to somewhere on this site.
 *
 * The `next` parameter arrives from a URL in an email, so it is attacker
 * controllable: a link to our own domain that quietly forwards to theirs is a
 * credible phishing gadget, and "it came from our login page" is exactly what
 * makes it credible. Only same-origin absolute paths survive.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  // "//evil.com" and "/\evil.com" are protocol-relative: the browser reads
  // them as a different host, even though they start with a slash.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/";
  }
  // A backslash or control character can smuggle a host past naive parsing.
  if (/[\\\r\n\t]/.test(raw)) return "/";
  return raw;
}
