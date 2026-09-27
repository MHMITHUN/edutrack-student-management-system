import type { Role, Student, Teacher, User } from "../types";
import { CLASS_IDS } from "./catalog";

/**
 * Demo user + directory seeds. Passwords are scrypt-hashed at seed time
 * (see demo-store.ts ensureSeeded) — never store real hashes here.
 * Demo password for every account: Demo@12345
 */

export const DEMO_PASSWORD = "Demo@12345";

/** User rows without passwordHash (hashing happens at seed time). */
export type SeedUser = Omit<User, "passwordHash">;

// ---- teachers -----------------------------------------------------------------

export const seedTeachers: Teacher[] = [
  {
    id: "tch-01",
    userId: "usr-teacher-01",
    name: "Asha Khatun",
    email: "teacher@demo.local",
    designation: "Associate Professor",
    subjectSlugs: ["bangla"],
    classAssignments: [
      { classId: CLASS_IDS.nineScience, subjectSlug: "bangla" },
      { classId: CLASS_IDS.nineBusiness, subjectSlug: "bangla" },
      { classId: CLASS_IDS.tenScience, subjectSlug: "bangla" },
      { classId: CLASS_IDS.tenBusiness, subjectSlug: "bangla" },
    ],
    joinYear: 2012,
  },
  {
    id: "tch-02",
    userId: "usr-teacher-02",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@demo.local",
    designation: "Assistant Professor",
    subjectSlugs: ["english"],
    classAssignments: [
      { classId: CLASS_IDS.nineScience, subjectSlug: "english" },
      { classId: CLASS_IDS.nineBusiness, subjectSlug: "english" },
      { classId: CLASS_IDS.tenScience, subjectSlug: "english" },
      { classId: CLASS_IDS.tenBusiness, subjectSlug: "english" },
    ],
    joinYear: 2015,
  },
  {
    id: "tch-03",
    userId: "usr-teacher-03",
    name: "Md. Anisur Rahman",
    email: "anisur.rahman@demo.local",
    designation: "Professor",
    subjectSlugs: ["mathematics"],
    classAssignments: [
      { classId: CLASS_IDS.nineScience, subjectSlug: "mathematics" },
      { classId: CLASS_IDS.nineBusiness, subjectSlug: "mathematics" },
      { classId: CLASS_IDS.tenScience, subjectSlug: "mathematics" },
      { classId: CLASS_IDS.tenBusiness, subjectSlug: "mathematics" },
    ],
    joinYear: 2008,
  },
  {
    id: "tch-04",
    userId: "usr-teacher-04",
    name: "Tanvir Ahmed",
    email: "tanvir.ahmed@demo.local",
    designation: "Lecturer",
    subjectSlugs: ["ict"],
    classAssignments: [
      { classId: CLASS_IDS.nineScience, subjectSlug: "ict" },
      { classId: CLASS_IDS.nineBusiness, subjectSlug: "ict" },
      { classId: CLASS_IDS.tenScience, subjectSlug: "ict" },
      { classId: CLASS_IDS.tenBusiness, subjectSlug: "ict" },
    ],
    joinYear: 2021,
  },
  {
    id: "tch-05",
    userId: "usr-teacher-05",
    name: "Shamima Akter",
    email: "shamima.akter@demo.local",
    designation: "Associate Professor",
    subjectSlugs: ["physics", "chemistry", "biology"],
    classAssignments: [
      { classId: CLASS_IDS.nineScience, subjectSlug: "physics" },
      { classId: CLASS_IDS.tenScience, subjectSlug: "physics" },
      { classId: CLASS_IDS.nineScience, subjectSlug: "chemistry" },
      { classId: CLASS_IDS.tenScience, subjectSlug: "chemistry" },
      { classId: CLASS_IDS.nineScience, subjectSlug: "biology" },
      { classId: CLASS_IDS.tenScience, subjectSlug: "biology" },
    ],
    joinYear: 2013,
  },
  {
    id: "tch-06",
    userId: "usr-teacher-06",
    name: "Abdul Karim",
    email: "abdul.karim@demo.local",
    designation: "Assistant Professor",
    subjectSlugs: ["accounting"],
    classAssignments: [
      { classId: CLASS_IDS.nineBusiness, subjectSlug: "accounting" },
      { classId: CLASS_IDS.tenBusiness, subjectSlug: "accounting" },
    ],
    joinYear: 2016,
  },
];

// ---- students -------------------------------------------------------------------

/** [studentName, guardianName, guardianPhone] per class, index = roll - 1. */
type SeedRoster = Array<[string, string, string]>;

const ROSTER_NINE_SCIENCE: SeedRoster = [
  ["Md. Siam Hossain", "Md. Sohel Hossain", "01711234501"],
  ["Sadia Islam", "Abdul Islam", "01711234502"],
  ["Rahim Uddin", "Karim Uddin", "01711234503"],
  ["Tasnim Akter", "Nazma Akter", "01711234504"],
  ["Arif Mahmud", "Jamal Mahmud", "01711234505"],
  ["Sumaiya Khatun", "Rokeya Khatun", "01711234506"],
  ["Nayeem Hasan", "Sultan Hasan", "01711234507"],
  ["Farzana Rahman", "Motiur Rahman", "01711234508"],
  ["Sabbir Ahmed", "Khorshed Ahmed", "01711234509"],
  ["Mehedi Hasan", "Rafiqul Islam", "01711234510"],
  ["Jannatul Ferdous", "Moinul Ferdous", "01711234511"],
  ["Rakin Absar", "Musa Absar", "01711234512"],
  ["Maliha Chowdhury", "Selina Chowdhury", "01711234513"],
  ["Faisal Karim", "Obaidul Karim", "01711234514"],
  ["Ishrat Jahan", "Shahinur Jahan", "01711234515"],
];

const ROSTER_TEN_SCIENCE: SeedRoster = [
  ["Rakib Hasan", "Habibur Rahman", "01812345601"],
  ["Tanjim Alam", "Shahidul Alam", "01812345602"],
  ["Maisha Rahman", "Mizanur Rahman", "01812345603"],
  ["Shahriar Kabir", "Humayun Kabir", "01812345604"],
  ["Anika Tabassum", "Anwar Tabassum", "01812345605"],
  ["Mahmudul Hasan", "Kamrul Hasan", "01812345606"],
  ["Samira Hoque", "Iqbal Hoque", "01812345607"],
  ["Rafi Chowdhury", "Nasir Chowdhury", "01812345608"],
  ["Nusrat Siddique", "Amir Siddique", "01812345609"],
  ["Sakib Rahman", "Efaz Rahman", "01812345610"],
  ["Farhan Ahsan", "Mahbub Ahsan", "01812345611"],
  ["Mithila Akter", "Shirin Akter", "01812345612"],
  ["Zayan Haque", "Rashedul Haque", "01812345613"],
  ["Puja Das", "Gopal Das", "01812345614"],
  ["Fahim Shahriar", "Delwar Shahriar", "01812345615"],
];

const ROSTER_NINE_BUSINESS: SeedRoster = [
  ["Riaz Uddin", "Aziz Uddin", "01913456701"],
  ["Sumona Parvin", "Abdul Halim", "01913456702"],
  ["Samir Hossain", "Liton Hossain", "01913456703"],
  ["Tania Sultana", "Rawshan Sultana", "01913456704"],
  ["Jahid Islam", "Anis Islam", "01913456705"],
  ["Rima Akter", "Parvin Akter", "01913456706"],
  ["Sajid Khan", "Alamgir Khan", "01913456707"],
  ["Naila Rahman", "Ziaur Rahman", "01913456708"],
  ["Ashraf Uddin", "Bashir Uddin", "01913456709"],
  ["Sharmin Nahar", "Mozammel Haque", "01913456710"],
  ["Russel Mahmud", "Joynal Mahmud", "01913456711"],
  ["Sonia Khatun", "Hasina Khatun", "01913456712"],
  ["Tamim Ahsan", "Sohel Ahsan", "01913456713"],
  ["Junaid Ahmed", "Selim Ahmed", "01913456714"],
  ["Laboni Akter", "Dulal Akter", "01913456715"],
];

const ROSTER_TEN_BUSINESS: SeedRoster = [
  ["Sourav Das", "Nikhil Das", "01614567801"],
  ["Mim Akter", "Shahin Akter", "01614567802"],
  ["Rasel Sheikh", "Abdul Matin", "01614567803"],
  ["Sneha Roy", "Sujit Roy", "01614567804"],
  ["Siam Mahmud", "Farid Mahmud", "01614567805"],
  ["Anisha Rahman", "Golam Rahman", "01614567806"],
  ["Tanvir Siddiki", "Yusuf Siddiki", "01614567807"],
  ["Maria Sultana", "Bilkis Sultana", "01614567808"],
  ["Sabbir Rahman", "Kalam Rahman", "01614567809"],
  ["Ridoy Hasan", "Alauddin Hasan", "01614567810"],
  ["Keya Khatun", "Feroza Khatun", "01614567811"],
  ["Sohan Miah", "Osman Miah", "01614567812"],
  ["Nadia Islam", "Sirajul Islam", "01614567813"],
  ["Abdullah Al Noman", "Abdur Rashid", "01614567814"],
  ["Payel Sen", "Biman Sen", "01614567815"],
];

function buildStudentSeeds(): { students: Student[]; users: SeedUser[] } {
  const students: Student[] = [];
  const users: SeedUser[] = [];
  const usedEmails = new Set<string>();
  let seq = 0;

  const rosters: Array<{
    roster: SeedRoster;
    classId: string;
    section: "Science" | "Business Studies";
    admissionYear: number;
  }> = [
    { roster: ROSTER_NINE_SCIENCE, classId: CLASS_IDS.nineScience, section: "Science", admissionYear: 2026 },
    { roster: ROSTER_NINE_BUSINESS, classId: CLASS_IDS.nineBusiness, section: "Business Studies", admissionYear: 2026 },
    { roster: ROSTER_TEN_SCIENCE, classId: CLASS_IDS.tenScience, section: "Science", admissionYear: 2025 },
    { roster: ROSTER_TEN_BUSINESS, classId: CLASS_IDS.tenBusiness, section: "Business Studies", admissionYear: 2025 },
  ];

  for (const { roster, classId, section, admissionYear } of rosters) {
    roster.forEach(([name, guardianName, guardianPhone], i) => {
      seq += 1;
      const roll = i + 1;
      const studentId = `stu-${String(seq).padStart(3, "0")}`;
      const userId = `usr-stu-${String(seq).padStart(3, "0")}`;
      const isDemoStudent = classId === CLASS_IDS.tenScience && roll === 1;
      const email = isDemoStudent
        ? "student@demo.local"
        : uniqueEmail(name, usedEmails, roll);

      students.push({
        id: studentId,
        userId,
        name,
        email,
        roll,
        classId,
        section,
        guardianName,
        guardianPhone,
        admissionYear,
        status: "active",
      });

      users.push({
        id: userId,
        name,
        email,
        role: "STUDENT" as Role,
        linkedId: studentId,
        status: "active" as const,
        // Admission spread across the first two weeks of January 2026.
        createdAt: new Date(
          Date.UTC(2026, 0, 8 + Math.floor(seq / 15), 9, (seq % 15) * 2, 0),
        ).toISOString(),
      });
    });
  }

  return { students, users };
}

/** first.last@std.demo.local, deduplicated deterministically by roll. */
function uniqueEmail(name: string, used: Set<string>, roll: number): string {
  const parts = name
    .toLowerCase()
    .replace(/\./g, "")
    .split(/\s+/)
    .filter((token) => token.length > 0 && token !== "md" && token !== "mohammad");
  const first = parts[0] ?? "student";
  const last = parts.length > 1 ? parts[parts.length - 1] : first;
  let base = `${first}.${last}`;
  if (used.has(base)) base = `${first}.${last}${roll}`;
  let email = `${base}@std.demo.local`;
  while (used.has(email)) email = `${base}x@std.demo.local`;
  used.add(email);
  return email;
}

const built = buildStudentSeeds();
export const seedStudents: Student[] = built.students;
export const seedStudentUsers: SeedUser[] = built.users;

// ---- users (all roles) --------------------------------------------------------

const adminUser: SeedUser = {
  id: "usr-admin-01",
  name: "Md. Rafiqul Islam",
  email: "admin@demo.local",
  role: "ADMIN",
  status: "active",
  createdAt: "2026-01-02T09:00:00.000Z",
};

const teacherUsers: SeedUser[] = seedTeachers.map((teacher, i) => ({
  id: teacher.userId,
  name: teacher.name,
  email: teacher.email,
  role: "TEACHER" as Role,
  linkedId: teacher.id,
  status: "active" as const,
  createdAt: `2026-01-03T${String(9 + i).padStart(2, "0")}:00:00.000Z`,
}));

export const seedUsers: SeedUser[] = [adminUser, ...teacherUsers, ...seedStudentUsers];
