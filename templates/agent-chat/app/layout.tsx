import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata = { title: process.env.NEXT_PUBLIC_AGENT_TITLE || "Agent" };
// Every page depends on who's signed in.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const body = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  return process.env.NEXT_PUBLIC_AUTH === "supabase" ? body : <ClerkProvider>{body}</ClerkProvider>;
}
