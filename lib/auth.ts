import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

const authDisabled = process.env.AUTH_DISABLED === "true";

export const { 
  auth, 
  handlers: { GET, POST }, 
  signIn, 
  signOut 
} = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (authDisabled) {
          throw new Error("Auth is disabled");
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password required");
        }

        const { prisma } = await import("./prisma");

        const user = await prisma.user.findUnique({
          where: { email: credentials.email }
        });

        if (!user) {
          throw new Error("No user found with this email");
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error("Invalid password");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name
        };
      }
    })
  ],
  pages: {
    signIn: "/auth/signin",
    newUser: "/auth/register"
  },
  callbacks: {
    async jwt({ token, user }) {
      try {
        if (user?.id) {
          token.id = user.id;
        }
      } catch (error) {
        console.error("[Auth][jwt] callback error", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
      return token;
    },
    async session({ session, token }) {
      try {
        if (session?.user && typeof token?.id === "string") {
          session.user.id = token.id;
        }
      } catch (error) {
        console.error("[Auth][session] callback error", {
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
      return session;
    }
  },
  session: {
    strategy: "jwt"
  },
  // Accept both legacy and Auth.js v5 env names.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true
});
