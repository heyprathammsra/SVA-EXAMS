import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canUserEditSubjectInClass,
  canUserViewSection,
  getEditableSubjectsForClass,
  getVisibleSectionsForUser,
  getVisibleSubjectsForClass,
  isClassTeacherForSection,
  NOT_A_CLASS_TEACHER_VALUE,
  normalizeTeacherProfile,
} from './teacher-permissions';

const ALL_CLASSES = ['Sparkle', 'Twinkle', 'Topaz', 'Jade', 'Garnet', 'Emerald', 'Ruby', 'Diamond'];
const ALL_SUBJECTS = [
  'English',
  'Hindi',
  'Marathi',
  'Maths',
  'Science',
  'Social Science',
  'Computer Science',
];

describe('teacher-permissions & class-subject mapping', () => {
  it('supports "Not a Class Teacher" option and normalizes assigned classes with subject', () => {
    const teacher = normalizeTeacherProfile({
      name: 'Anita Sharma',
      username: 'anita',
      assignedSubject: 'Maths',
      assignedClasses: ['Sparkle', 'Topaz'],
      classTeacherOf: NOT_A_CLASS_TEACHER_VALUE,
    });

    assert.equal(teacher.classTeacherOf, null);
    assert.deepEqual(teacher.assignedClasses, ['Sparkle', 'Topaz']);
    assert.deepEqual(teacher.assignments, [
      { section: 'Sparkle', subject: 'Maths' },
      { section: 'Topaz', subject: 'Maths' },
    ]);

    // Visible classes: only Sparkle and Topaz (no other unmapped classes)
    assert.deepEqual(getVisibleSectionsForUser(ALL_CLASSES, 'teacher', teacher), [
      'Sparkle',
      'Topaz',
    ]);
    assert.equal(canUserViewSection('Sparkle', 'teacher', teacher), true);
    assert.equal(canUserViewSection('Twinkle', 'teacher', teacher), false);
    assert.equal(canUserViewSection('Diamond', 'teacher', teacher), false);

    // In mapped class Sparkle: can ONLY see and edit Maths (no other subject)
    assert.deepEqual(getVisibleSubjectsForClass(ALL_SUBJECTS, 'Sparkle', 'teacher', teacher), [
      'Maths',
    ]);
    assert.deepEqual(getEditableSubjectsForClass(ALL_SUBJECTS, 'Sparkle', 'teacher', teacher), [
      'Maths',
    ]);
    assert.equal(canUserEditSubjectInClass('Sparkle', 'Maths', 'teacher', teacher), true);
    assert.equal(canUserEditSubjectInClass('Sparkle', 'Science', 'teacher', teacher), false);
    assert.equal(canUserEditSubjectInClass('Twinkle', 'Maths', 'teacher', teacher), false);
  });

  it('allows a Class Teacher to SEE all subjects marks & remarks in their class, but NO modification on unmapped subjects', () => {
    const classTeacher = normalizeTeacherProfile({
      name: 'Rahul Verma',
      username: 'rahul',
      assignedSubject: 'English',
      assignedClasses: ['Sparkle'], // teaches English in Sparkle only
      classTeacherOf: 'Twinkle', // Class Teacher of 6 Twinkle (does not teach a subject in Twinkle)
    });

    assert.equal(classTeacher.classTeacherOf, 'Twinkle');
    assert.equal(isClassTeacherForSection('Twinkle', 'teacher', classTeacher), true);
    assert.equal(isClassTeacherForSection('Sparkle', 'teacher', classTeacher), false);

    // Visible classes: Sparkle (mapped subject) + Twinkle (Class Teacher)
    assert.deepEqual(getVisibleSectionsForUser(ALL_CLASSES, 'teacher', classTeacher), [
      'Sparkle',
      'Twinkle',
    ]);

    // In Sparkle (Subject Teacher only): sees and edits ONLY English
    assert.deepEqual(
      getVisibleSubjectsForClass(ALL_SUBJECTS, 'Sparkle', 'teacher', classTeacher),
      ['English']
    );
    assert.deepEqual(
      getEditableSubjectsForClass(ALL_SUBJECTS, 'Sparkle', 'teacher', classTeacher),
      ['English']
    );
    assert.equal(canUserEditSubjectInClass('Sparkle', 'English', 'teacher', classTeacher), true);
    assert.equal(canUserEditSubjectInClass('Sparkle', 'Maths', 'teacher', classTeacher), false);

    // In Twinkle (Class Teacher only): SEES all 7 subjects, but CANNOT modify any subject
    assert.deepEqual(
      getVisibleSubjectsForClass(ALL_SUBJECTS, 'Twinkle', 'teacher', classTeacher),
      ALL_SUBJECTS
    );
    assert.deepEqual(
      getEditableSubjectsForClass(ALL_SUBJECTS, 'Twinkle', 'teacher', classTeacher),
      []
    );
    for (const sub of ALL_SUBJECTS) {
      assert.equal(
        canUserEditSubjectInClass('Twinkle', sub, 'teacher', classTeacher),
        false,
        `Expected ${sub} in Twinkle to be read-only for Class Teacher`
      );
    }
  });

  it('allows a Class Teacher who also teaches their assigned subject in that same class to edit ONLY their subject while viewing all others read-only', () => {
    const ctAndSubjectTeacher = normalizeTeacherProfile({
      name: 'Sneha Kulkarni',
      username: 'sneha',
      assignedSubject: 'Science',
      assignedClasses: ['Diamond', 'Ruby'],
      classTeacherOf: 'Diamond',
    });

    // In Diamond: sees all 7 subjects, but can ONLY edit Science
    assert.deepEqual(
      getVisibleSubjectsForClass(ALL_SUBJECTS, 'Diamond', 'teacher', ctAndSubjectTeacher),
      ALL_SUBJECTS
    );
    assert.deepEqual(
      getEditableSubjectsForClass(ALL_SUBJECTS, 'Diamond', 'teacher', ctAndSubjectTeacher),
      ['Science']
    );
    assert.equal(canUserEditSubjectInClass('Diamond', 'Science', 'teacher', ctAndSubjectTeacher), true);
    assert.equal(canUserEditSubjectInClass('Diamond', 'English', 'teacher', ctAndSubjectTeacher), false);
    assert.equal(canUserEditSubjectInClass('Diamond', 'Maths', 'teacher', ctAndSubjectTeacher), false);

    // In Ruby (not Class Teacher): sees and edits ONLY Science
    assert.deepEqual(
      getVisibleSubjectsForClass(ALL_SUBJECTS, 'Ruby', 'teacher', ctAndSubjectTeacher),
      ['Science']
    );
    assert.deepEqual(
      getEditableSubjectsForClass(ALL_SUBJECTS, 'Ruby', 'teacher', ctAndSubjectTeacher),
      ['Science']
    );
  });

  it('grants Admin full visibility and edit permissions across all classes and subjects', () => {
    assert.deepEqual(getVisibleSectionsForUser(ALL_CLASSES, 'admin', null), ALL_CLASSES);
    assert.deepEqual(
      getVisibleSubjectsForClass(ALL_SUBJECTS, 'Diamond', 'admin', null),
      ALL_SUBJECTS
    );
    assert.deepEqual(
      getEditableSubjectsForClass(ALL_SUBJECTS, 'Diamond', 'admin', null),
      ALL_SUBJECTS
    );
    assert.equal(canUserEditSubjectInClass('Diamond', 'Maths', 'admin', null), true);
  });
});
