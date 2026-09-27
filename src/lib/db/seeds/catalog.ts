import {
  DEFAULT_GRADE_BANDS,
  type AcademicYear,
  type SchoolClass,
  type Settings,
  type Subject,
} from "../types";

/**
 * Base catalog seeds: subjects, classes, academic years and school settings.
 * Fixed identifiers so marks/attendance seeds (later chunks) can reference
 * them deterministically.
 */

export const CLASS_IDS = {
  nineScience: "cls-9-science",
  nineBusiness: "cls-9-business",
  tenScience: "cls-10-science",
  tenBusiness: "cls-10-business",
} as const;

export const ACADEMIC_YEAR_IDS = {
  y2025: "ay-2025",
  y2026: "ay-2026",
} as const;

const SCIENCE_CLASSES = [
  CLASS_IDS.nineScience,
  CLASS_IDS.tenScience,
];
const BUSINESS_CLASSES = [CLASS_IDS.nineBusiness, CLASS_IDS.tenBusiness];
const ALL_CLASSES = [...SCIENCE_CLASSES, ...BUSINESS_CLASSES];

export const seedAcademicYears: AcademicYear[] = [
  { id: ACADEMIC_YEAR_IDS.y2025, label: "2025", active: false },
  { id: ACADEMIC_YEAR_IDS.y2026, label: "2026", active: true },
];

export const seedSubjects: Subject[] = [
  { slug: "bangla", name: "Bangla", code: "101", classes: ALL_CLASSES },
  { slug: "english", name: "English", code: "102", classes: ALL_CLASSES },
  { slug: "mathematics", name: "Mathematics", code: "107", classes: ALL_CLASSES },
  { slug: "ict", name: "ICT", code: "275", classes: ALL_CLASSES },
  { slug: "physics", name: "Physics", code: "174", classes: SCIENCE_CLASSES },
  { slug: "chemistry", name: "Chemistry", code: "176", classes: SCIENCE_CLASSES },
  { slug: "biology", name: "Biology", code: "178", classes: SCIENCE_CLASSES },
  { slug: "accounting", name: "Accounting", code: "253", classes: BUSINESS_CLASSES },
];

export const seedClasses: SchoolClass[] = [
  {
    id: CLASS_IDS.nineScience,
    name: "Class Nine",
    section: "Science",
    classTeacherId: "tch-01",
    academicYearId: ACADEMIC_YEAR_IDS.y2026,
  },
  {
    id: CLASS_IDS.nineBusiness,
    name: "Class Nine",
    section: "Business Studies",
    classTeacherId: "tch-04",
    academicYearId: ACADEMIC_YEAR_IDS.y2026,
  },
  {
    id: CLASS_IDS.tenScience,
    name: "Class Ten",
    section: "Science",
    classTeacherId: "tch-03",
    academicYearId: ACADEMIC_YEAR_IDS.y2026,
  },
  {
    id: CLASS_IDS.tenBusiness,
    name: "Class Ten",
    section: "Business Studies",
    classTeacherId: "tch-02",
    academicYearId: ACADEMIC_YEAR_IDS.y2026,
  },
];

export const seedSettings: Settings = {
  id: "school",
  schoolName: "EduTrack Demo School",
  gradeBands: DEFAULT_GRADE_BANDS,
  failCapsGpa: true,
  attendanceWarnPercent: 75,
};
