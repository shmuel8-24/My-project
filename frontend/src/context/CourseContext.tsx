/**
 * CourseContext — global course isolation state.
 * Actual implementation lives in src/app/providers/course.tsx (co-located with
 * the Next.js App Router provider tree). This file re-exports everything so
 * consumers can import from either path without duplication.
 *
 *   import { useCourse, COURSES } from '@/context/CourseContext';
 */
export { CourseProvider, useCourse, COURSES } from '../app/providers/course';
export type { Course } from '../app/providers/course';
