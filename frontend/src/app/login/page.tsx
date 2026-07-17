'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const redirect = () => router.replace('/?login=true');
    redirect();

    // If this route is ever restored from a stale back/forward navigation
    // state without remounting (see CourseProvider/AuthProvider's identical
    // pageshow pattern), this mount-only effect would never refire — the
    // redirect would silently not happen and the page would sit blank
    // forever, since it renders nothing. Re-firing on `pageshow` (fired
    // with persisted: true on a bfcache restore) guarantees the redirect
    // always happens.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) redirect(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [router]);

  return null;
}
