import { Link, Outlet, useLocation } from "react-router-dom";

const NAV = [
  {
    to: "/",
    label: "Collection",
    match: (path: string) => path === "/" || path.startsWith("/sets"),
  },
  {
    to: "/add",
    label: "Add set",
    match: (path: string) => path.startsWith("/add"),
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
          <p className="layout__tagline">Local-first owned sets</p>
        </div>
        <nav className="layout__nav" aria-label="Main">
          {NAV.map(({ to, label, match }) => (
            <Link
              key={to}
              to={to}
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
