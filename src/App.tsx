import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { ArchitecturalIntroduction } from './components/ArchitecturalIntroduction';
import { Footer } from './components/Footer';
import { HeroSection } from './components/HeroSection';
import { Navbar } from './components/Navbar';
import { OrganizationDirectory } from './components/OrganizationDirectory';
import { StudentEssentials } from './components/StudentEssentials';
import { StudentServices } from './components/StudentServices';
import { ResourceLibraryPage } from './pages/ResourceLibraryPage';
import { AdminPage } from './pages/AdminPage';

/**
 * Progressive enhancement only: routing/content never depends on animation.
 * Lenis uses the GSAP ticker for smooth wheel scrolling.
 */
function MotionController() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      anchors: true,
      lerp: 0.09,
      prevent: (node) => Boolean(node.closest('dialog[open]')),
    });

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (hash) {
      window.requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      }));
    } else if (hasMounted.current) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    hasMounted.current = true;
  }, [pathname, hash]);

  return null;
}

function HomePage() {
  return (
    <main id="top">
      <HeroSection />
      <ArchitecturalIntroduction />
      <StudentEssentials />
      <StudentServices />
      <OrganizationDirectory />
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="not-found-page">
      <div className="section-kicker">MEC Resource Library <span>—</span> 404</div>
      <h1>This page is<br /><em>not on the map.</em></h1>
      <p>The page may have moved. Return to the Student Desk home page or open the resource library.</p>
      <Link className="button button-dark" to="/">Back to home <span aria-hidden="true">↗</span></Link>
    </main>
  );
}

function RouteContent() {
  const { pathname } = useLocation();

  return (
    <div className="route-content" key={pathname}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/resources" element={<ResourceLibraryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionController />
      <ScrollManager />
      <Navbar />
      <RouteContent />
      <Footer />
      <Analytics />
    </BrowserRouter>
  );
}
