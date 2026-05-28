'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface Course {
  id:    string;
  name:  string;
  icon:  string;
  color: string;
}

export const COURSES: Course[] = [
  { id: 'infi1', name: 'אינפי 1',      icon: '📐', color: '#517B3E' },
  { id: 'ds',    name: 'מבני נתונים', icon: '🔢', color: '#3b7bbf' },
  { id: 'phys',  name: 'פיזיקה',       icon: '⚡', color: '#b45309' },
];

interface CourseContextValue {
  selectedCourse: Course | null;
  setSelectedCourse: (course: Course | null) => void;
}

const CourseContext = createContext<CourseContextValue>({
  selectedCourse:    null,
  setSelectedCourse: () => {},
});

export function CourseProvider({ children }: { children: ReactNode }) {
  const [selectedCourse, setSelectedCourseState] = useState<Course | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('levy_ai_course');
    if (!stored) return;
    Promise.resolve(stored)
      .then(s => JSON.parse(s) as Course)
      .then(course => setSelectedCourseState(course))
      .catch(() => localStorage.removeItem('levy_ai_course'));
  }, []);

  const setSelectedCourse = (course: Course | null) => {
    setSelectedCourseState(course);
    if (course) localStorage.setItem('levy_ai_course', JSON.stringify(course));
    else localStorage.removeItem('levy_ai_course');
  };

  return (
    <CourseContext.Provider value={{ selectedCourse, setSelectedCourse }}>
      {children}
    </CourseContext.Provider>
  );
}

export function useCourse(): CourseContextValue {
  return useContext(CourseContext);
}
