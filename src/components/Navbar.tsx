import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname, hash } = useLocation();

  const closeMenu = () => setMenuOpen(false);
  const goHome = () => {
    closeMenu();
    if (pathname === '/' && !hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  return (
    <header className="nav-wrap">
      <Link className="brand" to="/" aria-label="MEC Resource Library home" onClick={goHome}>
        <img className="brand-logo" src="/mec-logo.png" alt="" />
        <span className="brand-name">
          MEC Resource Library
          <small>MYMENSINGH ENGINEERING COLLEGE</small>
        </span>
      </Link>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="site-nav"
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <i aria-hidden="true" />
        <i aria-hidden="true" />
      </button>
      <nav id="site-nav" className={menuOpen ? 'open' : undefined} aria-label="Main navigation">
        <Link to="/" onClick={goHome}>Home</Link>
        <Link to="/#campus" onClick={closeMenu}>Campus</Link>
        <Link to="/#student-tools" onClick={closeMenu}>Essential Tools</Link>
        <Link to="/#clubs" onClick={closeMenu}>Clubs &amp; Labs</Link>
        <Link className="nav-cta" to="/resources" onClick={closeMenu}>Explore Library <span>↗</span></Link>
      </nav>
    </header>
  );
}
