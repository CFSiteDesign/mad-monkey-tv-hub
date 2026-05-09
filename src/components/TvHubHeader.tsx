import logo from "@/assets/mad-monkey-logo.png";
import type { Session } from "@/lib/tv.functions";

export function TvHubHeader({
  session, onLogout,
}: { session: Session; onLogout: () => void }) {
  const pillText =
    session.role === "global_marketing"
      ? "Mad Monkey Hostels · Global Marketing"
      : `${session.name} · ${session.country}`;

  return (
    <header className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-white/10">
      <img src={logo} alt="TheoroX" className="h-14 w-auto" />
      <div className="hidden md:block">
        <h1 className="tv-gradient-underline text-2xl font-bold">TV Hub</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="tv-pill">{pillText}</span>
        <button
          onClick={onLogout}
          className="text-sm text-soft hover:text-white transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}

export function TvHubFooter() {
  return (
    <footer className="flex items-center justify-between px-6 sm:px-10 py-6 mt-16 border-t border-white/10 text-sm">
      <span className="text-soft">TV Hub by TheoroX</span>
      <a
        href="https://theorox.com"
        target="_blank" rel="noreferrer"
        className="text-soft hover:text-white transition-colors"
      >
        theorox.com
      </a>
    </footer>
  );
}
