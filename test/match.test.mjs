import test from 'node:test';
import assert from 'node:assert/strict';
import { isStudentReq } from '../scripts/lib/match.mjs';

// Every title below is a real one pulled off Zoom's Workday board, either live today or from the
// summer 2026 batch, so these cases stay honest about what the board actually says.
const ZOOM_STUDENT_REQS = [
  'Software Engineer - Intern',
  'Software Developer Engineer – Intern',
  'AI/ML Intern - Agentic Retrieval & Enterprise RAG',
  'Research Intern - Quality & Safety - AI Safety',
  'Enterprise Graph Retrieval Intern',
  'AI Engineering Intern - AI Agent',
  'AI Infrastructure Intern',
  'Gen AI Research Intern - Zoom GenAI R&D Team',
  'Speech Scientist Intern',
  'AI Scientist Intern - Agentic AI',
  'Intern AI Product Management',
];

const ZOOM_REAL_JOBS = [
  'Zoom International Employment Counsel',
  'Audio Software Engineer',
  'Senior Solutions Engineer - Upmarket West',
  'Staff AI Engineer - AI Verticals',
  'Lead Technical SEO Manager',
  'Data Center Support Technician',
];

test('every Zoom student req from last cycle matches', () => {
  for (const title of ZOOM_STUDENT_REQS) {
    assert.equal(isStudentReq(title), true, title);
  }
});

test('ordinary Zoom jobs do not match', () => {
  for (const title of ZOOM_REAL_JOBS) {
    assert.equal(isStudentReq(title), false, title);
  }
});

test('International does not read as Intern', () => {
  assert.equal(isStudentReq('Zoom International Employment Counsel'), false);
  assert.equal(isStudentReq('Internal Audit Manager'), false);
  assert.equal(isStudentReq('Manager, Internal Communications'), false);
});

test('the other student wordings match', () => {
  assert.equal(isStudentReq('2027 University Graduate, Software Engineer'), true);
  assert.equal(isStudentReq('Software Engineer Co-Op (Spring 2027)'), true);
  assert.equal(isStudentReq('Software Engineer, Coop'), true);
  assert.equal(isStudentReq('New Grad Software Engineer'), true);
  assert.equal(isStudentReq('Campus Recruiting Program, Engineering'), true);
  assert.equal(isStudentReq('Summer Internship Program 2027'), true);
});

test('a target can override the patterns', () => {
  assert.equal(isStudentReq('Audio Software Engineer', { include: ['audio'] }), true);
  assert.equal(isStudentReq('Software Engineer - Intern', { exclude: ['\\bintern\\b'] }), false);
});

test('empty and missing titles are not reqs', () => {
  assert.equal(isStudentReq(''), false);
  assert.equal(isStudentReq('   '), false);
  assert.equal(isStudentReq(undefined), false);
  assert.equal(isStudentReq(null), false);
});
