
export type ExternalService = {
  label: string;
  url: string;
  description: string;
};

// Replace either URL with an empty string to show its unconfigured state.
export const serviceLinks = {
  assignmentCover: {
    label: 'Assignment Cover Page',
    url: 'https://meccover.fidazaman.com',
    description:
      'Create a formatted cover page for your assignments and lab reports.',
  },
  smartPrinting: {
    label: 'Smart Printing',
    url: 'https://smartvendbd.com/printing/',
    description:
      'Upload documents and continue through the existing printing service workflow.',
  },
} satisfies Record<string, ExternalService>;
