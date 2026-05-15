import { Link, Outlet, useLocation } from "react-router-dom";

const NAV = [
  {
    to: "/",
    label: "Collection",
    match: (path: string) => path === "/" || path.startsWith("/sets"),
  },
  {
    to: "/",
    label: "Add set",
    state: { openAddSet: true } as const,
    match: () => false,
  },
  {
    to: "/search",
    label: "Search",
    match: (path: string) => path.startsWith("/search"),
  },
  {
    to: "/import",
    label: "Import",
    match: (path: string) => path.startsWith("/import"),
  },
] as const;

export function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="layout">
      <header className="layout__header">
        <div className="layout__brand">
          <Link to="/" className="layout__title">
            LEGO Collection Manager
          </Link>
          <p className="layout__tagline">Local-first LEGO collection</p>
        </div>
        <nav className="layout__nav" aria-label="Main">
          {NAV.map(({ to, label, match, ...rest }) => (
            <Link
              key={label}
              to={to}
              state={"state" in rest ? rest.state : undefined}
              className={
                match(pathname)
                  ? "layout__nav-link layout__nav-link--active"
                  : "layout__nav-link"
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="layout__main">
        <Outlet />
      </main>
    </div>
  );
}
