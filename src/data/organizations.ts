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
  { name: 'Mechatronics & Embedded System Lab', abbreviation: 'MESL', category: 'Laboratory', description: 'A campus laboratory listing. Details will be added when verified.', imageUrl: '/mesl.png', websiteUrl: 'https://meslmec.com/', socialLinks: [{ label: 'Facebook', url: 'https://www.facebook.com/MESLMEC/' }] },
  { name: 'Alpha Science Lab', abbreviation: 'ASL', category: 'Laboratory', description: 'A campus laboratory listing. Details will be added when verified.', imageUrl: '/asl.png', socialLinks: [{ label: 'Facebook', url: 'https://www.facebook.com/Alpha.Science.Lab/' }] },
  { name: 'MEC Computer Club', category: 'Club', description: 'A student community listing. Details will be added when verified.', imageUrl: '/mcc.png', websiteUrl: 'https://meccomputerclub.org/', socialLinks: [{ label: 'Facebook', url: 'https://www.facebook.com/meccomputerclub/' }] },
  { name: 'MEC Cultural Club', category: 'Club', description: 'A student community listing. Details will be added when verified.', imageUrl: '/culturalclub.png', socialLinks: [{ label: 'Facebook', url: 'https://web.facebook.com/profile.php?id=61585112259982' }] },
  { name: 'Mymensingh Engineering College Debating Society', category: 'Club', description: 'A student community listing. Details will be added when verified.', imageUrl: '/debatingclub.png', socialLinks: [{ label: 'Facebook', url: 'https://web.facebook.com/profile.php?id=61583176866458' }] },
];
