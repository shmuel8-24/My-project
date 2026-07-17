'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface Course {
  id:    string;
  name:  string;
  icon:  string;
  color: string;
}

export const COURSES: Course[] = [
  { id: 'infi1', name: 'אינפי 1',      icon: '📐', color: '#517B3E' },
  { id: 'ds',    name: 'מבני נתונים', icon: '💻', color: '#3b7bbf' },
  { id: 'phys',  name: 'פיזיקה',       icon: '⚡', color: '#b45309' },
];

interface CourseContextValue {
  selectedCourse:     Course | null;
  setSelectedCourse:  (course: Course | null) => void;
  courseHydrated:     boolean;
  customCourses:      Course[];
  addCustomCourse:    (course: Course) => void;
  removeCustomCourse: (id: string) => void;
  updateCustomCourse: (id: string, updates: Partial<Omit<Course, 'id'>>) => void;
}

const CourseContext = createContext<CourseContextValue>({
  selectedCourse:     null,
  setSelectedCourse:  () => {},
  courseHydrated:     false,
  customCourses:      [],
  addCustomCourse:    () => {},
  removeCustomCourse: () => {},
  updateCustomCourse: () => {},
});

export function CourseProvider({ children }: { children: ReactNode }) {
  const [selectedCourse,  setSelectedCourseState] = useState<Course | null>(null);
  const [courseHydrated,  setCourseHydrated]      = useState(false);
  const [customCourses,   setCustomCoursesState]  = useState<Course[]>([]);

  useEffect(() => {
    const hydrate = () => {
      Promise.resolve()
        .then(() => {
          const storedCustom   = localStorage.getItem('levy_ai_custom_courses');
          const storedSelected = localStorage.getItem('levy_ai_course');
          if (storedCustom) setCustomCoursesState(JSON.parse(storedCustom) as Course[]);
          setSelectedCourseState(storedSelected ? (JSON.parse(storedSelected) as Course) : null);
        })
        .catch(() => {})
        .finally(() => setCourseHydrated(true));
    };

    hydrate();

    // A page restored from the browser's back/forward cache resumes with
    // whatever state it had when frozen. If that was mid-hydration (still
    // null), this mount-only effect would never rerun to fix it, leaving
    // any course-gated page stuck blank until a hard refresh. Re-hydrating
    // on `pageshow` (fired with `persisted: true` on a bfcache restore)
    // guarantees selectedCourse always resolves on back/forward navigation.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) hydrate(); };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const setSelectedCourse = useCallback((course: Course | null) => {
    setSelectedCourseState(course);
    if (course) {
      localStorage.setItem('levy_ai_course', JSON.stringify(course));
      document.cookie = 'levy_ai_course_active=1; path=/; SameSite=Lax; max-age=86400';
    } else {
      localStorage.removeItem('levy_ai_course');
      document.cookie = 'levy_ai_course_active=; path=/; SameSite=Lax; max-age=0';
    }
  }, []);

  const addCustomCourse = useCallback((course: Course) => {
    setCustomCoursesState(prev => {
      const updated = [...prev, course];
      localStorage.setItem('levy_ai_custom_courses', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeCustomCourse = useCallback((id: string) => {
    setCustomCoursesState(prev => {
      const updated = prev.filter(c => c.id !== id);
      localStorage.setItem('levy_ai_custom_courses', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateCustomCourse = useCallback((id: string, updates: Partial<Omit<Course, 'id'>>) => {
    setCustomCoursesState(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      localStorage.setItem('levy_ai_custom_courses', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <CourseContext.Provider value={{ selectedCourse, setSelectedCourse, courseHydrated, customCourses, addCustomCourse, removeCustomCourse, updateCustomCourse }}>
      {children}
    </CourseContext.Provider>
  );
}

export function useCourse(): CourseContextValue {
  return useContext(CourseContext);
}
