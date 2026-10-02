import { createAuthClient } from "better-auth/react";
import { twoFactorClient, adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    twoFactorClient(),
    adminClient(),
  ],
});

export const { useSession, signIn, signOut, signUp } = authClient;
