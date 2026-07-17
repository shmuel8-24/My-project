'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    const redirect = () => router.replace('/?register=true');
    redirect();

    // See login/page.tsx's identical pageshow pattern: guarantees the
    // redirect still fires if this route is restored from a stale
    // back/forward navigation state without remounting.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) redirect(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [router]);

  return null;
}
