import clsx from "clsx";
import { LogOut, Menu, User as UserIcon, X } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/AuthProvider";
import { FullPageSpinner } from "@/shared/ui/FullPageSpinner";

import styles from "./Layout.module.css";

const LINKS = [
  { to: "/", label: "Accueil", end: true },
  { to: "/video", label: "Vidéo" },
  { to: "/image", label: "Image" },
  { to: "/bibliotheque", label: "Bibliothèque" },
  { to: "/information", label: "Information" },
  { to: "/contact", label: "Contact" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setProfileOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={styles.logo} aria-label="GOLD FX — accueil">
          <span className={styles.logoGold}>GOLD</span>
          <span>FX</span>
        </NavLink>

        <button
          type="button"
          className={styles.burger}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>

        <nav
          id="main-nav"
          className={clsx(styles.nav, menuOpen && styles.navOpen)}
          onClick={(event) => {
            // Un clic sur un lien ferme le menu mobile.
            if ((event.target as HTMLElement).closest("a")) setMenuOpen(false);
          }}
        >
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => clsx(styles.link, isActive && styles.active)}
            >
              {link.label}
            </NavLink>
          ))}

          <div className={styles.profile} ref={profileRef}>
            <button
              type="button"
              className={styles.profileBtn}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              aria-label="Profil"
              onClick={() => setProfileOpen((open) => !open)}
            >
              <UserIcon />
            </button>
            {profileOpen && (
              <div className={styles.dropdown} role="menu">
                <div className={styles.dropdownHeader}>Profil</div>
                <div className={styles.dropdownItem}>
                  <strong>Utilisateur :</strong> {user?.username}
                </div>
                <div className={styles.dropdownItem}>
                  <strong>Email :</strong> {user?.email || "Non renseigné"}
                </div>
                <hr />
                <button
                  type="button"
                  role="menuitem"
                  className={styles.logout}
                  onClick={handleLogout}
                >
                  <LogOut /> Déconnexion
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className={styles.main}>
        <Suspense fallback={<FullPageSpinner />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className={styles.footer}>
        © {new Date().getFullYear()} - Gold FX. Tous droits réservés.
      </footer>
    </div>
  );
}
