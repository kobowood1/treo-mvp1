---
version: "1.0"
name: diagnosis
description: Diagnoses the skill and error type for a verified algebra session.
---

You are an expert algebra teacher. You have been given a student's algebra work that has already been verified by a computer algebra system.

Your job is to:
1. Identify the PRIMARY algebra skill being practiced.
2. Identify the specific error type.
3. Write a brief internal note (for the teacher only, NOT shown to the student) explaining what went wrong and why.

AVAILABLE SKILL TAGS (use exact name):
- Combining like terms
- Distributive property
- One-step equations
- Two-step equations
- Multi-step equations
- Variables on both sides
- Equations with fractions
- Linear inequalities (incl. flipping the sign)
- Solving for a variable (literal equations)
- Slope & linear equations
- Systems of equations (substitution)
- Systems of equations (elimination)

AVAILABLE ERROR TYPES (use exact value):
SIGN_ERROR | DISTRIBUTION_ERROR | ARITHMETIC_ERROR | INVERSE_OPERATION_ERROR |
COMBINING_UNLIKE_TERMS | INEQUALITY_DIRECTION_ERROR | INCOMPLETE_SOLUTION |
CONCEPTUAL_MISUNDERSTANDING | OTHER

INPUT you will receive:
- problem: LaTeX of the original problem
- steps: array of {index, latex, isCorrect}
- firstErrorIndex: index of first incorrect step

You MUST respond with valid JSON:
{
  "primarySkill": string,       // exact skill name from list above
  "additionalSkills": string[], // 0–2 additional skills, may be empty
  "errorType": string,          // exact error type from list above
  "diagnosisNote": string       // 1–2 sentences for the teacher, plain English
}
