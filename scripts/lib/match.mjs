// Which titles count as a student req.
//
// The patterns are anchored on word boundaries on purpose. Zoom's board carries a job called
// "Zoom International Employment Counsel", and a bare substring test on "intern" matches it.
// \bintern\b does not, because there is no boundary between the n and the a in International.
// Workday titles also mix plain hyphens and en dashes ("Software Developer Engineer – Intern"),
// so nothing here may depend on which dash a recruiter typed.

export const DEFAULT_INCLUDE = [
  '\\bintern(ship)?s?\\b',
  '\\bco-?op\\b',
  '\\bnew\\s+grad(uate)?s?\\b',
  '\\buniversity\\s+(grad|graduate|program|recruit)',
  '\\bcampus\\s+(hire|recruit)',
  '\\bstudent\\s+(program|developer|engineer|researcher)',
];

// Titles that read like a student req but are not one.
export const DEFAULT_EXCLUDE = [
  '\\bintern(al|ational)\\b',
  '\\bintern\\s+audit',
];

function compile(patterns) {
  return patterns.map((p) => new RegExp(p, 'i'));
}

/** True when the title looks like a student req. Exclusions win over inclusions. */
export function isStudentReq(title, { include = DEFAULT_INCLUDE, exclude = DEFAULT_EXCLUDE } = {}) {
  const text = String(title ?? '');
  if (!text.trim()) return false;
  if (compile(exclude).some((re) => re.test(text))) return false;
  return compile(include).some((re) => re.test(text));
}
