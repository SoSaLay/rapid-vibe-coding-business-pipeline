import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RVC Pipeline",
  description: "Rapid Vibe Coding Business Pipeline",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Applies the saved theme before first paint so there's no dark→light flash.
const themeInit = `(function(){try{var t=localStorage.getItem('theme')||'dark';var r=document.documentElement;if(t==='light'){r.classList.add('light');}r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
