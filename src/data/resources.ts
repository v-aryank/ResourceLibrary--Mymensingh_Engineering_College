export const resourceCategories = [
  { id: 'books', label: 'Books' },
  { id: 'lab-reports', label: 'Lab Reports' },
  { id: 'lab-guides', label: 'Lab Experiments & Guides' },
  { id: 'lecture-notes', label: 'Lecture Notes' },
  { id: 'course-outlines', label: 'Course Outlines' },
  { id: 'other', label: 'Other Academic Materials' },
] as const;

export type ResourceCategory = (typeof resourceCategories)[number]['id'];

export type AcademicPeriod = {
  year: number;
  semester: number;
};

export type AcademicResource = {
  id: string;
  title: string;
  category: ResourceCategory;
  description: string;
  author?: string;
  department?: 'EEE' | 'CSE' | 'CE';
  academicYear?: string;
  semester?: string;
  courseCode?: string;
  subject?: string;
  keywords?: string[];
  fileUrl?: string;
  fileUrlExpiresAt?: number;
  fileFormat?: string;
  fileSize?: string;
  hasFile?: boolean;
  hasThumbnail?: boolean;
  demonstration?: boolean;
  thumbnailUrl?: string;
  thumbnailUrlExpiresAt?: number;
  thumbnailStatus?: 'none' | 'loading' | 'ready' | 'missing' | 'error';
  academicPeriods?: AcademicPeriod[];
};

// These records demonstrate filtering and detail states; they do not represent real MEC materials.
// Replace them with verified catalogue entries and real file URLs before publishing resources.
export const resources: AcademicResource[] = resourceCategories.map((category) => ({
  id: `demo-${category.id}`,
  title: `Example entry — ${category.label}`,
  category: category.id,
  description: 'Demonstration record only. Replace this entry with verified resource details; no file is attached.',
  demonstration: true,
}));

// Update these lists to match the current academic calendar.
export const academicYearOptions = ['1st year', '2nd year', '3rd year', '4th year'];
export const semesterOptions = ['1st semester', '2nd semester'];
