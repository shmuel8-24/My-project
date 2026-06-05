'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth }   from '../providers/auth';
import { useCourse } from '../providers/course';

/**
 * Dashboard layout guard — runs before the page renders.
 * Returns null (no shell, no user data) until both auth and course selection
 * are confirmed. The parallel useEffect fires the redirect; the synchronous
 * null return prevents any content from flickering into view first.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { selectedCourse, courseHydrated } = useCourse();

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) { router.replace('/?login=true'); return; }
    if (!courseHydrated) return;
    if (!selectedCourse) router.replace('/course-picker');
  }, [authLoading, authUser, courseHydrated, selectedCourse, router]);

  if (authLoading || !authUser || !courseHydrated || !selectedCourse) return null;

  return <>{children}</>;
}
