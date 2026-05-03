'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Registration is now handled by the unified login flow.
// New users are identified and onboarded at /login.
export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/login'); }, [router]);
  return null;
}
