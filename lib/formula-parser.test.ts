import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSafeFormula, assignGrade } from './formula-parser';
import { DEFAULT_GRADE_CONFIG } from './sample-data';

test('Formula parser evaluates standard mathematical operations correctly', () => {
  const result = evaluateSafeFormula('(10 + 20 + 30) / 3', {});
  assert.equal(result.success, true);
  assert.equal(result.result, 20);
});

test('Formula parser evaluates custom variables substitution', () => {
  const vars = {
    TOTAL_OBTAINED: 450,
    TOTAL_MAX: 500,
    English: 85,
    Mathematics: 95,
  };
  const result = evaluateSafeFormula('(TOTAL_OBTAINED / TOTAL_MAX) * 100', vars);
  assert.equal(result.success, true);
  assert.equal(result.result, 90);
});

test('Formula parser evaluates subject-specific variable formula', () => {
  const vars = {
    English: 80,
    Mathematics: 100,
    Science: 90,
  };
  const result = evaluateSafeFormula('(English + Mathematics + Science) / 3', vars);
  assert.equal(result.success, true);
  assert.equal(result.result, 90);
});

test('Formula parser handles invalid expressions safely without crashing', () => {
  const result = evaluateSafeFormula('10 / 0', {});
  assert.equal(result.success, false);
  assert.match(result.error || '', /division by zero/i);
});

test('Grade assignment maps percentage to correct grade category', () => {
  assert.equal(assignGrade(95, DEFAULT_GRADE_CONFIG), 'A1');
  assert.equal(assignGrade(85, DEFAULT_GRADE_CONFIG), 'A2');
  assert.equal(assignGrade(75, DEFAULT_GRADE_CONFIG), 'B1');
  assert.equal(assignGrade(65, DEFAULT_GRADE_CONFIG), 'B2');
  assert.equal(assignGrade(55, DEFAULT_GRADE_CONFIG), 'C1');
  assert.equal(assignGrade(45, DEFAULT_GRADE_CONFIG), 'C2');
  assert.equal(assignGrade(35, DEFAULT_GRADE_CONFIG), 'D');
  assert.equal(assignGrade(32, DEFAULT_GRADE_CONFIG), 'D');
  assert.equal(assignGrade(25, DEFAULT_GRADE_CONFIG), 'E1');
  assert.equal(assignGrade(15, DEFAULT_GRADE_CONFIG), 'E2');
});
