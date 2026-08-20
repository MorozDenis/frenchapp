"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Drill" },
  { href: "/bank", label: "Bank" },
  { href: "/cheatsheet", label: "Cheat sheet" },
  { href: "/progress", label: "Progress" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <nav className="topbar no-print">
      <Link href="/" className="topbar__brand">
        Débit<span>fr</span>
      </Link>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`topbar__link${pathname === link.href ? " topbar__link--on" : ""}`}
        >
          {link.label}
        </Link>
      ))}
      <span className="topbar__spacer" />
      <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>
        Sign out
      </button>
    </nav>
  );
}
