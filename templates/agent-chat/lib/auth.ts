/** Who's signed in (Clerk or Supabase, per NEXT_PUBLIC_AUTH). Server-side only. */

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const AUTH = process.env.NEXT_PUBLIC_AUTH === "supabase" ? "supabase" : "clerk";

export function supabaseServer() {
  const store = cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a page render: the middleware keeps the session fresh instead.
        }
      },
    },
  });
}

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  if (AUTH === "supabase") {
    const { data } = await supabaseServer().auth.getUser();
    return data.user?.id ?? null;
  }
  const { userId } = await auth();
  return userId ?? null;
}
