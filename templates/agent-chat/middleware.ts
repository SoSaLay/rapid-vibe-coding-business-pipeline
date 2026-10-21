/** Only signed-in people get past this: everyone else goes to the sign-in page. */

import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = ["/sign-in", "/login", "/auth/callback"];
const isPublic = createRouteMatcher(PUBLIC.map((p) => `${p}(.*)`));

const clerk = clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});

async function supabase(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await client.auth.getUser();
  if (!data.user && !PUBLIC.some((p) => req.nextUrl.pathname.startsWith(p))) {
    if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}

export default function middleware(req: NextRequest, ev: any) {
  return process.env.NEXT_PUBLIC_AUTH === "supabase" ? supabase(req) : clerk(req, ev);
}

export const config = { matcher: ["/((?!_next|.*\\..*).*)", "/(api)(.*)"] };
