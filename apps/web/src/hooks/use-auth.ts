/**
 * @file use-auth.ts
 * @module hooks/use-auth
 *
 * Re-exports `useAuth` from `auth-provider` for ergonomic importing.
 *
 * Components should import from this hook file rather than directly from the
 * provider module, keeping the import path stable if the provider is ever
 * refactored.
 */

export { useAuth } from '../providers/auth-provider';
