
const aiPrompts = {
    claimExtractionPrompt: `Based on the following text, extract any health claims made in it. Return the output as a JSON. \n\n
    Text: {{text}}
  `,
    claimCategorizationPrompt: `Categorize the following health claims into one of the following categories: Nutrition, Medicine, Mental Health. Return as JSON.
    Claims: {{claims}}`,
    duplicateRemovalPrompt: `Remove duplicate claims from the following list, return as JSON.
    Claims: {{claims}}`,
    trustScoreGenerationPrompt: `Based on the following verification status, give a trust score on a scale from 0 to 1, and a justification. Return the output as JSON.
     Verification Status: {{status}}
  `,
  };
  
  module.exports = {
      aiPrompts,
  };