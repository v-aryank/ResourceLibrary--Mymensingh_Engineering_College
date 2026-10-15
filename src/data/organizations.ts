export type Organization = {
  name: string;
  abbreviation?: string;
  category: 'Laboratory' | 'Club';
  description: string;
  imageUrl?: string;
  websiteUrl?: string;
  socialLinks?: { label: string; url: string }[];
  contact?: string;
};

export const organizations: Organization[] = [
  { name: 'Mechatronics & Embedded System Lab', abbreviation: 'MESL', category: 'Laboratory', description: 'A campus laboratory listing. Details will be added when verified.' },
  { name: 'Alpha Science Lab', abbreviation: 'ASL', category: 'Laboratory', description: 'A campus laboratory listing. Details will be added when verified.' },
  { name: 'MEC Computer Club', category: 'Club', description: 'A student community listing. Details will be added when verified.' },
  { name: 'MEC Cultural Club', category: 'Club', description: 'A student community listing. Details will be added when verified.' },
  { name: 'MEC Debating Club', category: 'Club', description: 'A student community listing. Details will be added when verified.' },
];
