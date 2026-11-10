import { Student, Examination, MarksRecord, CalculationSetting, GradeConfig, CalculatedStudentResult } from './types';

/**
 * Safe Mathematical Expression Evaluator
 * Evaluates expressions like "(English + Mathematics + Science) / 3" or "(TOTAL_OBTAINED / TOTAL_MAX) * 100"
 * without using eval() or Function().
 */
export interface FormulaVariable {
  name: string;
  value: number;
  description: string;
}

export function evaluateSafeFormula(
  formula: string,
  variables: Record<string, number>
): { success: boolean; result: number; error?: string } {
  try {
    if (!formula || !formula.trim()) {
      return { success: false, result: 0, error: 'Formula is empty' };
    }

    // Sanitize and replace variable names in formula
    let sanitized = formula;

    // Sort variable names by length descending so longer tokens match first
    const sortedVarKeys = Object.keys(variables).sort((a, b) => b.length - a.length);

    for (const key of sortedVarKeys) {
      const val = variables[key];
      // Escape special characters in key for RegExp
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKey}\\b`, 'g');
      sanitized = sanitized.replace(regex, `(${val})`);
    }

    // Tokenize expression
    const tokens = tokenizeExpression(sanitized);
    if (!tokens || tokens.length === 0) {
      return { success: false, result: 0, error: 'Invalid formula structure' };
    }

    const rpn = convertToRPN(tokens);
    const value = evaluateRPN(rpn);

    if (isNaN(value) || !isFinite(value)) {
      return { success: false, result: 0, error: 'Formula produced undefined or infinite result (division by zero)' };
    }

    return { success: true, result: Math.round(value * 100) / 100 };
  } catch (err: any) {
    return { success: false, result: 0, error: err.message || 'Formula syntax error' };
  }
}

// Tokenizer for mathematical expression
function tokenizeExpression(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  expr = expr.replace(/\s+/g, '');

  while (i < expr.length) {
    const char = expr[i];

    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^' || char === '(' || char === ')') {
      tokens.push(char);
      i++;
    } else if (/[0-9.]/.test(char)) {
      let numStr = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      tokens.push(numStr);
    } else if (/[a-zA-Z_]/.test(char)) {
      // Identifier that wasn't replaced (unresolved variable)
      let idStr = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        idStr += expr[i];
        i++;
      }
      throw new Error(`Unresolved variable in formula: "${idStr}"`);
    } else {
      throw new Error(`Unexpected character in formula: "${char}"`);
    }
  }

  return tokens;
}

// Shunting-Yard Algorithm to convert Infix to Reverse Polish Notation (RPN)
function convertToRPN(tokens: string[]): string[] {
  const outputQueue: string[] = [];
  const operatorStack: string[] = [];

  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    '^': 3,
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (!isNaN(Number(token))) {
      outputQueue.push(token);
    } else if (token === '(') {
      operatorStack.push(token);
    } else if (token === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0) {
        throw new Error('Mismatched parentheses in formula');
      }
      operatorStack.pop(); // Pop '('
    } else if (precedence[token]) {
      // Unary minus handling
      if (token === '-' && (i === 0 || tokens[i - 1] === '(' || precedence[tokens[i - 1]])) {
        outputQueue.push('0');
      }
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== '(' &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    } else {
      throw new Error(`Unknown token: ${token}`);
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top === '(' || top === ')') {
      throw new Error('Mismatched parentheses in formula');
    }
    outputQueue.push(top);
  }

  return outputQueue;
}

// Evaluate RPN Stack
function evaluateRPN(rpn: string[]): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (!isNaN(Number(token))) {
      stack.push(Number(token));
    } else {
      if (stack.length < 2) {
        throw new Error('Invalid math expression');
      }
      const b = stack.pop()!;
      const a = stack.pop()!;

      switch (token) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) throw new Error('Division by zero in formula');
          stack.push(a / b);
          break;
        case '^':
          stack.push(Math.pow(a, b));
          break;
        default:
          throw new Error(`Invalid operator: ${token}`);
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid formula structure');
  }

  return stack[0];
}

/**
 * Assign Grade from Percentage using Grade Configuration
 */
export function assignGrade(percentage: number, gradeConfig: GradeConfig): string {
  if (isNaN(percentage) || percentage === null) return 'E';

  for (const cat of gradeConfig.categories) {
    if (percentage >= cat.minPercent && percentage <= cat.maxPercent) {
      return cat.grade;
    }
  }

  return 'E';
}

/**
 * Sanitizes subject name into a valid formula variable key
 * E.g. "English Language" -> "English_Language" or "English"
 */
export function sanitizeSubjectVarName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Core Result Calculation Engine
 */
export function calculateStudentResult(
  student: Student,
  exam: Examination,
  marksRecord: MarksRecord | undefined,
  calcSetting: CalculationSetting,
  gradeConfig: GradeConfig
): CalculatedStudentResult {
  const breakdown: string[] = [];
  const subjectResults: CalculatedStudentResult['subjectResults'] = [];

  let totalObtained = 0;
  let totalMax = 0;
  let hasFailedSubject = false;
  let failedSubjectCount = 0;
  let isAnyAbsent = false;

  const variables: Record<string, number> = {};

  exam.subjects.forEach((subj) => {
    const rawVal = marksRecord?.marks[subj.subjectId];
    const isAbsent = rawVal === 'AB';
    const isBlank = rawVal === undefined || rawVal === null;
    let numericObtained: number | 'AB' | null = null;
    let subjPercent: number | null = null;
    let subjGrade = 'E';
    let status: 'PASS' | 'FAIL' | 'ABSENT' | 'INCOMPLETE' = 'PASS';

    if (isAbsent) {
      isAnyAbsent = true;
      numericObtained = 'AB';
      status = 'ABSENT';
      if (calcSetting.passFailRules.absentAsFail) {
        hasFailedSubject = true;
        failedSubjectCount++;
      }
      breakdown.push(`Subject ${subj.subjectName}: Student was ABSENT.`);
    } else if (isBlank) {
      numericObtained = null;
      status = 'INCOMPLETE';
      breakdown.push(`Subject ${subj.subjectName}: Marks incomplete/not entered.`);
    } else {
      const markNum = Number(rawVal);
      numericObtained = markNum;
      totalObtained += markNum;
      totalMax += subj.maxMarks;

      subjPercent = (markNum / subj.maxMarks) * 100;
      subjGrade = assignGrade(subjPercent, gradeConfig);

      // Pass/Fail check per subject
      const minPass = subj.passMarks || (subj.maxMarks * (calcSetting.passFailRules.minSubjectPassPercent / 100));
      if (markNum < minPass) {
        status = 'FAIL';
        hasFailedSubject = true;
        failedSubjectCount++;
      }

      breakdown.push(
        `Subject ${subj.subjectName}: ${markNum}/${subj.maxMarks} (${subjPercent.toFixed(2)}%) -> Grade ${subjGrade} [${status}]`
      );
    }

    // Set variable value for formula
    const numValForFormula = typeof numericObtained === 'number' ? numericObtained : 0;
    const sanitizedName = sanitizeSubjectVarName(subj.subjectName);
    variables[sanitizedName] = numValForFormula;
    variables[subj.subjectId] = numValForFormula;

    subjectResults.push({
      subjectId: subj.subjectId,
      subjectName: subj.subjectName,
      maxMarks: subj.maxMarks,
      passMarks: subj.passMarks,
      obtainedMarks: numericObtained,
      percentage: subjPercent !== null ? Math.round(subjPercent * 100) / 100 : null,
      grade: subjGrade,
      status,
    });
  });

  // Add aggregate formula variables
  variables['TOTAL_OBTAINED'] = totalObtained;
  variables['TOTAL_MAX'] = totalMax > 0 ? totalMax : 1;
  variables['SUBJECT_COUNT'] = exam.subjects.length;

  let percentage = 0;
  let formulaUsedDesc = '';

  if (calcSetting.mode === 'formula' && calcSetting.customFormula) {
    formulaUsedDesc = `Custom Formula: ${calcSetting.customFormula}`;
    const evalRes = evaluateSafeFormula(calcSetting.customFormula, variables);
    if (evalRes.success) {
      percentage = evalRes.result;
      breakdown.push(`Evaluated formula "${calcSetting.customFormula}" -> ${percentage}%`);
    } else {
      breakdown.push(`Formula evaluation error: ${evalRes.error}. Falling back to aggregate ratio.`);
      percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    }
  } else {
    // Rule-based mode
    formulaUsedDesc = 'Rule-based weighted aggregate';
    let weightedObtained = 0;
    let weightedMax = 0;

    exam.subjects.forEach((s) => {
      if (calcSetting.ruleIncludedSubjectIds.includes(s.subjectId)) {
        const rawVal = marksRecord?.marks[s.subjectId];
        const val = typeof rawVal === 'number' ? rawVal : 0;
        const weight = calcSetting.ruleSubjectWeights[s.subjectId] ?? 1.0;
        weightedObtained += val * weight;
        weightedMax += s.maxMarks * weight;
      }
    });

    percentage = weightedMax > 0 ? (weightedObtained / weightedMax) * 100 : 0;
    breakdown.push(`Rule-based calculation: Weighted total ${weightedObtained.toFixed(1)} / ${weightedMax.toFixed(1)} -> ${percentage.toFixed(2)}%`);
  }

  percentage = Math.round(percentage * 100) / 100;
  const finalGrade = assignGrade(percentage, gradeConfig);

  // Overall Result Status determination
  let resultStatus: 'PASS' | 'FAIL' | 'COMPARTMENT' | 'ABSENT' = 'PASS';

  if (isAnyAbsent && subjectResults.every((s) => s.obtainedMarks === 'AB')) {
    resultStatus = 'ABSENT';
  } else if (hasFailedSubject) {
    if (failedSubjectCount <= 2 && calcSetting.passFailRules.subjectWisePassRequired) {
      resultStatus = 'COMPARTMENT';
    } else {
      resultStatus = 'FAIL';
    }
  } else if (
    calcSetting.passFailRules.overallAggregatePassRequired &&
    percentage < calcSetting.passFailRules.minAggregatePercent
  ) {
    resultStatus = 'FAIL';
  }

  breakdown.push(`Final Percentage: ${percentage}% | Grade: ${finalGrade} | Status: ${resultStatus}`);

  return {
    totalObtained,
    totalMax,
    percentage,
    grade: finalGrade,
    resultStatus,
    subjectResults,
    formulaUsed: formulaUsedDesc,
    calculationBreakdown: breakdown,
  };
}

/**
 * Calculate Ranks for an entire class/exam list
 */
export function calculateClassRanks(
  students: Student[],
  exam: Examination,
  marksRecords: MarksRecord[],
  calcSetting: CalculationSetting,
  gradeConfig: GradeConfig
): Record<string, CalculatedStudentResult> {
  const resultMap: Record<string, CalculatedStudentResult> = {};

  // 1. Calculate individual results
  const list: Array<{ studentId: string; result: CalculatedStudentResult }> = [];

  students.forEach((student) => {
    const record = marksRecords.find((r) => r.studentId === student.id && r.examId === exam.id);
    const res = calculateStudentResult(student, exam, record, calcSetting, gradeConfig);
    resultMap[student.id] = res;
    if (res.resultStatus === 'PASS') {
      list.push({ studentId: student.id, result: res });
    }
  });

  // 2. Sort by metric (percentage or total marks) descending
  list.sort((a, b) => {
    if (calcSetting.rankingMetric === 'totalMarks') {
      return b.result.totalObtained - a.result.totalObtained;
    }
    return b.result.percentage - a.result.percentage;
  });

  // 3. Assign ranks handling ties
  let currentRank = 1;
  for (let i = 0; i < list.length; i++) {
    if (i > 0) {
      const prev = list[i - 1].result;
      const curr = list[i].result;
      const isEqual =
        calcSetting.rankingMetric === 'totalMarks'
          ? prev.totalObtained === curr.totalObtained
          : prev.percentage === curr.percentage;

      if (!isEqual) {
        currentRank = i + 1;
      }
    }
    resultMap[list[i].studentId].rank = currentRank;
  }

  return resultMap;
}
