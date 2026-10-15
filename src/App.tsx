import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { ArchitecturalIntroduction } from './components/ArchitecturalIntroduction';
import { CampusHighlights } from './components/CampusHighlights';
import { Footer } from './components/Footer';
import { HeroSection } from './components/HeroSection';
import { Navbar } from './components/Navbar';
import { OrganizationDirectory } from './components/OrganizationDirectory';
import { StudentEssentials } from './components/StudentEssentials';
import { StudentServices } from './components/StudentServices';
import { ResourceLibraryPage } from './pages/ResourceLibraryPage';

gsap.registerPlugin(ScrollTrigger);

/**
 * Progressive enhancement only: routing/content never depends on animation.
 * Lenis and ScrollTrigger share one GSAP ticker, with complete cleanup on unmount.
 */
function MotionController() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    document.documentElement.classList.add('motion-ready');
    const lenis = new Lenis({
      autoRaf: false,
      smoothWheel: true,
      syncTouch: false,
      anchors: true,
      lerp: 0.09,
    });

    const updateScrollTrigger = () => ScrollTrigger.update();
    const raf = (time: number) => lenis.raf(time * 1000);
    lenis.on('scroll', updateScrollTrigger);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const context = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(
        'main > section, .resource-page-heading, .resource-catalogue, .not-found-page, footer'
      ).forEach((element) => {
        // Only animate sections below the first viewport; keep the hero immediate.
        if (element.classList.contains('hero')) return;
        gsap.fromTo(element,
          { y: 18, autoAlpha: 0.82 },
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.65,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: element,
              start: 'top 92%',
              once: true,
            },
          }
        );
      });
    });

    // Refresh after fonts/layout settle, without tying rendering to image loading.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh, { once: true });
    const refreshFrame = window.requestAnimationFrame(refresh);

    return () => {
      window.removeEventListener('load', refresh);
      window.cancelAnimationFrame(refreshFrame);
      context.revert();
      lenis.off('scroll', updateScrollTrigger);
      gsap.ticker.remove(raf);
      lenis.destroy();
      document.documentElement.classList.remove('motion-ready');
    };
  }, []);

  return null;
}

function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      window.requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      }));
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [pathname, hash]);

  return null;
}

function HomePage() {
  return (
    <main id="top">
      <HeroSection />
      <ArchitecturalIntroduction />
      <CampusHighlights />
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

export default function App() {
  return (
    <BrowserRouter>
      <MotionController />
      <ScrollManager />
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/resources" element={<ResourceLibraryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Footer />
    </BrowserRouter>
  );
}
