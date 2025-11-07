function mapResponsesToQuestions(studyJson, responseJson) {
  const result = [];

  // Flatten all questions from all sections
  // const allQuestions = studyJson.study.sections.flatMap(section => section.questions);

  // Loop over each answered field
  for (const [key, value] of Object.entries(responseJson)) {
    // Skip metadata fields
    if (
      [
        'lastSaved',
        'doctorName',
        'hasConsented',
        'consent_agreement',
        'currentSectionIndex',
      ].includes(key)
    )
      continue;

    // Find matching question by ID
    const question = studyJson.find((q) => q.id === key);

    if (question) {
      // Convert array answers to comma-separated string
      const answer = Array.isArray(value) ? value.join(', ') : value;

      result.push({
        id: key,
        question: question.text,
        answer,
      });
    }
  }

  return result;
}
module.exports = { mapResponsesToQuestions };
