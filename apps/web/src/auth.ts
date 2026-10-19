import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/db";
import { upsertUserFromOAuth } from "@/db/repo";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
  }
}

export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days absolute lifetime
export const SESSION_UPDATE_AGE = 60 * 60 * 24; // re-issued (renewed) at most once a day while active

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // Identity only. No Gmail/Drive/Calendar scopes are requested.
      authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      // Only accept Google accounts whose email Google has verified.
      return (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
    },
    async jwt({ token, account, profile }) {
      // `account` is only present on the sign-in request: create/refresh the DB user once.
      if (account && profile?.email) {
        const user = await upsertUserFromOAuth(getDb(), {
          provider: account.provider,
          providerUserId: account.providerAccountId,
          email: profile.email,
          name: profile.name,
          image: (profile as { picture?: string }).picture ?? null,
        });
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      return session;
    },
  },
});
