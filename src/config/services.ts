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
    description: 'Open the existing student-built assignment and lab-report cover generator.',
  },
  smartPrinting: {
    label: 'Smart Printing',
    url: 'https://smartvendbd.com/printing/',
    description: 'Continue to the existing student printing service for its upload and payment workflow.',
  },
} satisfies Record<string, ExternalService>;
