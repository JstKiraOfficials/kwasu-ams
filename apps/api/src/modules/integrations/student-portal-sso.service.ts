/**
 * @file student-portal-sso.service.ts
 * @module modules/integrations
 *
 * Stub for KWASU Student Portal SSO integration.
 * Pending external API specification from KWASU IT department.
 */

/**
 * Authenticates a user via the KWASU Student Portal SSO token.
 *
 * @param _token - SSO token from the Student Portal.
 * @throws Always — not implemented in v1.0.
 */
export async function ssoLogin(_token: string): Promise<never> {
  throw new Error('Not implemented');
}
