import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ArchitecturalIntroduction } from './components/ArchitecturalIntroduction';
import { CampusHighlights } from './components/CampusHighlights';
import { Footer } from './components/Footer';
import { HeroSection } from './components/HeroSection';
import { Navbar } from './components/Navbar';
import { OrganizationDirectory } from './components/OrganizationDirectory';
import { StudentEssentials } from './components/StudentEssentials';
import { StudentServices } from './components/StudentServices';
import { ResourceLibraryPage } from './pages/ResourceLibraryPage';

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
      <div className="section-kicker">MEC STUDENT DESK <span>—</span> 404</div>
      <h1>This page is<br /><em>not on the map.</em></h1>
      <p>The page may have moved. Return to the Student Desk home page or open the resource library.</p>
      <a className="button button-dark" href="/">Back to home <span aria-hidden="true">↗</span></a>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
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
