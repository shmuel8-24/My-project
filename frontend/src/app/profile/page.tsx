'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth, AUTH_KEYS } from '../providers/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5003';

// ── Static option sets ────────────────────────────────────────────────────────

const STUDY_YEAR_OPTIONS = [
  { value: 'year_1',  he: 'שנה א׳',         en: '1st Year' },
  { value: 'year_2',  he: 'שנה ב׳',         en: '2nd Year' },
  { value: 'year_3',  he: 'שנה ג׳',         en: '3rd Year' },
  { value: 'year_4',  he: 'שנה ד׳',         en: '4th Year' },
  { value: 'masters', he: 'תואר שני / אחר', en: "Master's / Other" },
] as const;

const DEGREE_TYPE_OPTIONS = [
  { value: 'regular',     he: 'תואר רגיל (B.Sc / B.A)',  en: "Bachelor's (B.Sc / B.A)" },
  { value: 'double',      he: 'תואר דו-חוגי',              en: 'Double Major' },
  { value: 'specialized', he: 'תואר עם התמחות',             en: 'With Specialization' },
] as const;

const AI_STYLE_OPTIONS = [
  { value: 'exam_focused', he: 'מתומצת וממוקד מבחן',         en: 'Concise & Exam-Focused' },
  { value: 'academic',     he: 'מעמיק ואקדמי',                en: 'Deep & Academic' },
  { value: 'simple',       he: 'הסברים פשוטים בגובה העיניים', en: 'Simplified / Plain Terms' },
] as const;

const GENDER_OPTIONS = [
  { value: 'זכר',  he: 'זכר',  en: 'Male'   },
  { value: 'נקבה', he: 'נקבה', en: 'Female' },
  { value: 'אחר',  he: 'אחר',  en: 'Other'  },
] as const;

// ── i18n ──────────────────────────────────────────────────────────────────────

const i18n = {
  he: {
    langLabel:            'EN',
    backToApp:            'חזרה ל-Workspace',
    memberSince:          'חבר מאז',
    tabProfile:           'הגדרות',
    tabDocs:              'המסמכים שלי',
    personalInfo:         'פרטים אישיים',
    editProfile:          'עריכה',
    saveChanges:          'שמור',
    saving:               'שומר...',
    cancel:               'ביטול',
    logout:               'יציאה',
    firstNameLabel:       'שם פרטי',
    lastNameLabel:        'שם משפחה',
    emailLabel:           'אימייל',
    genderLabel:          'מגדר',
    genderOther:          'אחר / לא מעוניין להצהיר',
    loading:              'טוען...',
    saveSuccess:          'הפרופיל עודכן בהצלחה',
    serverErr:            'לא ניתן להתחבר לשרת.',
    academicSettings:     'הגדרות לימודים',
    editAcademic:         'עריכה',
    saveAcademic:         'שמור',
    cancelAcademic:       'ביטול',
    savingAcademic:       'שומר...',
    institutionLabel:     'מוסד לימודים',
    degreeTypeLabel:      'סוג תואר',
    primaryMajorLabel:    'חוג ראשי',
    secondaryMajorDouble: 'חוג משני',
    secondaryMajorSpec:   'התמחות',
    studyYearLabel:       'שנת לימוד',
    aiStyleLabel:         'סגנון AI מועדף',
    academicSuccess:      'פרטי הלימודים עודכנו בהצלחה',
    uploadsLabel:         'העלאות החודש',
    questionsLabel:       'שאלות החודש',
    unlimited:            'ללא הגבלה',
    statChats:            'שיחות',
    statMessages:         'הודעות',
    statDocs:             'מסמכים',
    myDocs:               'המסמכים שלי',
    docName:              'שם המסמך',
    docDate:              'תאריך העלאה',
    docSize:              'גודל',
    deleteDoc:            'מחק',
    deleteDocTitle:       'מחיקת מסמך',
    deleteDocBody:        (name: string) => `האם למחוק את "${name}"? הפעולה אינה הפיכה והמסמך יוסר מכל השיחות.`,
    deleting:             'מוחק...',
    noDocuments:          'לא הועלו מסמכים עדיין.',
    docDeleteErr:         'שגיאה במחיקת המסמך.',
    loadDocsErr:          'שגיאה בטעינת המסמכים.',
    notSet:               'לא הוגדר',
    selectPh:             '— בחר —',
  },
  en: {
    langLabel:            'HE',
    backToApp:            'Back to Workspace',
    memberSince:          'Member since',
    tabProfile:           'Settings',
    tabDocs:              'My Documents',
    personalInfo:         'Personal Info',
    editProfile:          'Edit',
    saveChanges:          'Save',
    saving:               'Saving…',
    cancel:               'Cancel',
    logout:               'Log out',
    firstNameLabel:       'First name',
    lastNameLabel:        'Last name',
    emailLabel:           'Email',
    genderLabel:          'Gender',
    genderOther:          'Other / Prefer not to say',
    loading:              'Loading…',
    saveSuccess:          'Profile updated',
    serverErr:            'Cannot connect to server.',
    academicSettings:     'Academic Settings',
    editAcademic:         'Edit',
    saveAcademic:         'Save',
    cancelAcademic:       'Cancel',
    savingAcademic:       'Saving…',
    institutionLabel:     'Institution',
    degreeTypeLabel:      'Degree Type',
    primaryMajorLabel:    'Major',
    secondaryMajorDouble: 'Minor',
    secondaryMajorSpec:   'Specialization',
    studyYearLabel:       'Year of Study',
    aiStyleLabel:         'Preferred AI Style',
    academicSuccess:      'Academic details updated',
    uploadsLabel:         'Uploads this month',
    questionsLabel:       'Questions this month',
    unlimited:            'Unlimited',
    statChats:            'Chats',
    statMessages:         'Messages',
    statDocs:             'Documents',
    myDocs:               'My Documents',
    docName:              'Document Name',
    docDate:              'Upload Date',
    docSize:              'Size',
    deleteDoc:            'Delete',
    deleteDocTitle:       'Delete document',
    deleteDocBody:        (name: string) => `Delete "${name}"? This can't be undone and removes it from all chats.`,
    deleting:             'Deleting…',
    noDocuments:          'No documents uploaded yet.',
    docDeleteErr:         'Error deleting document.',
    loadDocsErr:          'Error loading documents.',
    notSet:               'Not set',
    selectPh:             '— Select —',
  },
} as const;

type Lang = 'he' | 'en';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileDoc {
  file_id:         string;
  filename:        string;
  uploaded_at:     string | null;
  file_size_bytes: number | null;
  chunks:          number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function authFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, credentials: 'include' });
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return '—'; }
}

// ── Small components ──────────────────────────────────────────────────────────

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#FDFCF8"/>
      <rect width="40" height="40" rx="9" stroke="rgba(107,144,74,0.35)" strokeWidth="1.5" fill="none"/>
      <path d="M9 7 L9 26 C9 35 31 35 31 26 L31 7 L25 7 L25 26 C25 30 15 30 15 26 L15 7 Z" fill="#6B904A"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return <span className={`rounded-full border-2 border-t-current animate-spin inline-block ${className ?? 'w-3.5 h-3.5 border-white/30 border-t-white'}`} />;
}

function UsageBar({
  label, used, limit, unlimited,
}: {
  label: string;
  used: number;
  limit: number | null;
  unlimited: string;
}) {
  if (limit === null) {
    return (
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-[#517B3E]">{unlimited}</span>
      </div>
    );
  }
  const pct  = Math.min(100, Math.round((used / limit) * 100));
  const warn = pct >= 80;
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs text-slate-500">{label}</span>
        <span className={`text-xs font-semibold ${warn ? 'text-amber-600' : 'text-slate-600'}`}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: warn
              ? 'linear-gradient(90deg,#f59e0b,#d97706)'
              : 'linear-gradient(90deg,#517B3E,#6B904A)',
          }}
        />
      </div>
    </div>
  );
}

// Shared input/select styling constants
const INPUT_BASE = "w-full rounded-xl border bg-stone-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all";
const INPUT_STYLE = { borderColor: 'rgba(200,190,170,0.75)' } as const;

function inputFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = '#517B3E';
  e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(81,123,62,0.15)';
}
function inputBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'rgba(200,190,170,0.75)';
  e.currentTarget.style.boxShadow   = 'none';
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Exported so /workspace/documents can render the same component (incl. its
// Documents tab) directly — landing there opens straight to that tab without
// duplicating the fetch/list/delete logic that lives here.
export function ProfilePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user: authUser, isLoading: authLoading, logout: authLogout } = useAuth();

  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'he';
    return localStorage.getItem('levy_ai_lang') === 'en' ? 'en' : 'he';
  });
  const he  = lang === 'he';
  const dir = he ? 'rtl' : 'ltr';
  const t   = i18n[lang];

  const [activeTab, setActiveTab] = useState<'profile' | 'documents'>(() => {
    if (searchParams.get('tab') === 'documents') return 'documents';
    if (pathname === '/workspace/documents') return 'documents';
    return 'profile';
  });
  const [loading,   setLoading]   = useState(true);

  // ── Personal info ──────────────────────────────────────────────────────────
  const [firstName,       setFirstName]       = useState('');
  const [lastName,        setLastName]        = useState('');
  const [email,           setEmail]           = useState('');
  const [createdAt,       setCreatedAt]       = useState('');
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [draftFirst,      setDraftFirst]      = useState('');
  const [draftLast,       setDraftLast]       = useState('');
  const [draftGender,     setDraftGender]     = useState('');
  const [savingPersonal,  setSavingPersonal]  = useState(false);
  const [personalOk,      setPersonalOk]      = useState('');
  const [personalErr,     setPersonalErr]     = useState('');

  // ── Academic info ──────────────────────────────────────────────────────────
  const [institution,    setInstitution]    = useState('');
  const [degreeType,     setDegreeType]     = useState('');
  const [primaryMajor,   setPrimaryMajor]   = useState('');
  const [secondaryMajor, setSecondaryMajor] = useState('');
  const [studyYear,      setStudyYear]      = useState('');
  const [aiStyle,        setAiStyle]        = useState('');
  // pass-through (not shown in academic editor)
  const [country,        setCountry]        = useState('');
  const [gender,         setGender]         = useState('');

  const [editingAcademic,     setEditingAcademic]     = useState(false);
  const [draftInstitution,    setDraftInstitution]    = useState('');
  const [draftDegreeType,     setDraftDegreeType]     = useState('');
  const [draftPrimaryMajor,   setDraftPrimaryMajor]   = useState('');
  const [draftSecondaryMajor, setDraftSecondaryMajor] = useState('');
  const [draftStudyYear,      setDraftStudyYear]      = useState('');
  const [draftAiStyle,        setDraftAiStyle]        = useState('');
  const [savingAcademic,      setSavingAcademic]      = useState(false);
  const [academicOk,          setAcademicOk]          = useState('');
  const [academicErr,         setAcademicErr]         = useState('');

  // ── Plan & stats ───────────────────────────────────────────────────────────
  const [sessionCount,  setSessionCount]  = useState(0);
  const [messageCount,  setMessageCount]  = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [uploadsUsed,   setUploadsUsed]   = useState(0);
  const [questionsUsed, setQuestionsUsed] = useState(0);

  // ── Documents vault ────────────────────────────────────────────────────────
  const [documents,     setDocuments]     = useState<ProfileDoc[]>([]);
  const [loadingDocs,   setLoadingDocs]   = useState(false);
  const [docsLoaded,    setDocsLoaded]    = useState(false);
  const [deletingDocId,       setDeletingDocId]       = useState<string | null>(null);
  const [docToDelete,         setDocToDelete]         = useState<ProfileDoc | null>(null);
  const [isDeleteModalClosing, setIsDeleteModalClosing] = useState(false);
  const [docErr,        setDocErr]        = useState('');

  // ── Language sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('levy_ai_lang', lang);
  }, [lang]);

  // ── Initial data fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) { router.replace('/?login=true'); return; }

    Promise.all([
      authFetch(`${API}/api/profile`),
      authFetch(`${API}/api/usage`),
    ])
      .then(async ([pRes, uRes]) => {
        if (pRes.status === 401) {
          AUTH_KEYS.forEach(k => localStorage.removeItem(k));
          document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
          window.location.href = '/?login=true';
          return;
        }
        const p = await pRes.json();
        setFirstName(p.first_name       ?? '');
        setLastName(p.last_name         ?? '');
        setEmail(p.email                ?? '');
        setCreatedAt(p.created_at       ?? '');
        setSessionCount(p.session_count  ?? 0);
        setMessageCount(p.message_count  ?? 0);
        setDocumentCount(p.document_count ?? 0);
        setInstitution(p.institution    ?? '');
        setDegreeType(p.degree_type     ?? '');
        setPrimaryMajor(p.primary_major ?? '');
        setSecondaryMajor(p.secondary_major ?? '');
        setStudyYear(p.study_year       ?? '');
        setAiStyle(p.ai_style           ?? '');
        setCountry(p.country            ?? '');
        setGender(p.gender              ?? '');

        if (uRes.ok) {
          const u = await uRes.json();
          setUploadsUsed(u.uploads_this_month    ?? 0);
          setQuestionsUsed(u.questions_this_month ?? 0);
        }
      })
      .catch(() => setPersonalErr(i18n.he.serverErr))
      .finally(() => setLoading(false));
  }, [authLoading, authUser, router]);

  // ── Lazy-load documents when loadingDocs is set to true ───────────────────
  useEffect(() => {
    if (!loadingDocs || docsLoaded) return;
    authFetch(`${API}/api/profile/documents`)
      .then(async r => {
        if (!r.ok) { setDocErr(i18n.he.loadDocsErr); return; }
        const data = await r.json();
        setDocuments(data.documents ?? []);
      })
      .catch(() => setDocErr(i18n.he.loadDocsErr))
      .finally(() => { setLoadingDocs(false); setDocsLoaded(true); });
  }, [loadingDocs, docsLoaded]);

  // ── Personal handlers ──────────────────────────────────────────────────────
  const startEditPersonal = () => {
    setDraftFirst(firstName); setDraftLast(lastName); setDraftGender(gender);
    setPersonalOk(''); setPersonalErr(''); setEditingPersonal(true);
  };
  const cancelEditPersonal = () => { setEditingPersonal(false); setPersonalErr(''); };
  const savePersonal = async () => {
    if (!draftFirst.trim() || !draftLast.trim()) return;
    setSavingPersonal(true); setPersonalErr('');
    try {
      const res  = await authFetch(`${API}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: draftFirst.trim(),
          last_name:  draftLast.trim(),
          gender:     draftGender,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPersonalErr(data.error ?? i18n.he.serverErr); return; }
      // Use the server echo when it explicitly returns gender; fall back to
      // draftGender (what we sent) so a server that omits the key never clears it.
      const newGender: string = typeof data.gender === 'string' ? data.gender : draftGender;
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setGender(newGender);
      localStorage.setItem('levy_ai_first_name', data.first_name);
      localStorage.setItem('levy_ai_last_name',  data.last_name);
      localStorage.setItem('levy_ai_gender',     newGender);
      setEditingPersonal(false);
      setPersonalOk(i18n[lang].saveSuccess);
      setTimeout(() => setPersonalOk(''), 3000);
    } catch { setPersonalErr(i18n.he.serverErr); }
    finally { setSavingPersonal(false); }
  };

  // ── Academic handlers ──────────────────────────────────────────────────────
  const startEditAcademic = () => {
    setDraftInstitution(institution);
    setDraftDegreeType(degreeType);
    setDraftPrimaryMajor(primaryMajor);
    setDraftSecondaryMajor(secondaryMajor);
    setDraftStudyYear(studyYear);
    setDraftAiStyle(aiStyle);
    setAcademicOk(''); setAcademicErr(''); setEditingAcademic(true);
  };
  const cancelEditAcademic = () => { setEditingAcademic(false); setAcademicErr(''); };
  const saveAcademic = async () => {
    setSavingAcademic(true); setAcademicErr('');
    try {
      const res = await authFetch(`${API}/api/user/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country,
          gender,
          institution:     draftInstitution.trim(),
          degree_type:     draftDegreeType,
          primary_major:   draftPrimaryMajor.trim(),
          secondary_major: draftSecondaryMajor.trim(),
          study_year:      draftStudyYear,
          ai_style:        draftAiStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAcademicErr(data.error ?? i18n.he.serverErr); return; }
      setInstitution(data.institution       ?? '');
      setDegreeType(data.degree_type        ?? '');
      setPrimaryMajor(data.primary_major    ?? '');
      setSecondaryMajor(data.secondary_major ?? '');
      setStudyYear(data.study_year          ?? '');
      setAiStyle(data.ai_style              ?? '');
      localStorage.setItem('levy_ai_institution',     data.institution    ?? '');
      localStorage.setItem('levy_ai_degree_type',     data.degree_type    ?? '');
      localStorage.setItem('levy_ai_primary_major',   data.primary_major  ?? '');
      localStorage.setItem('levy_ai_secondary_major', data.secondary_major ?? '');
      setEditingAcademic(false);
      setAcademicOk(i18n[lang].academicSuccess);
      setTimeout(() => setAcademicOk(''), 3000);
    } catch { setAcademicErr(i18n.he.serverErr); }
    finally { setSavingAcademic(false); }
  };

  // ── Document handlers ──────────────────────────────────────────────────────
  const handleDeleteDoc = async (fileId: string) => {
    if (deletingDocId) return;
    setDeletingDocId(fileId); setDocErr('');
    try {
      const res = await authFetch(`${API}/documents/${fileId}`, { method: 'DELETE' });
      if (!res.ok) { setDocErr(i18n.he.docDeleteErr); return; }
      // Purge stale localStorage reference so academic-writing/workspace stay in sync.
      try {
        const raw = localStorage.getItem('unote_academic_uploads');
        if (raw) {
          const parsed = JSON.parse(raw) as Array<{ fileId?: string }>;
          const filtered = parsed.filter(f => f.fileId !== fileId);
          if (filtered.length !== parsed.length) {
            filtered.length > 0
              ? localStorage.setItem('unote_academic_uploads', JSON.stringify(filtered))
              : localStorage.removeItem('unote_academic_uploads');
          }
        }
      } catch { /* non-critical */ }
      setDocuments(prev => prev.filter(d => d.file_id !== fileId));
      setDocumentCount(prev => Math.max(0, prev - 1));
    } catch { setDocErr(i18n.he.docDeleteErr); }
    finally { setDeletingDocId(null); setDocToDelete(null); }
  };

  function closeDeleteModal() {
    if (deletingDocId) return;
    setIsDeleteModalClosing(true);
    setTimeout(() => { setDocToDelete(null); setIsDeleteModalClosing(false); }, 180);
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const initials = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase()
    || email.slice(0, 2).toUpperCase();

  const formattedSince = (() => {
    if (!createdAt) return '';
    try {
      return new Date(createdAt).toLocaleDateString(he ? 'he-IL' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return ''; }
  })();

  const genderDisplayLabel = gender === 'אחר' ? t.genderOther
    : GENDER_OPTIONS.find(o => o.value === gender)?.[lang] ?? gender;

  const degreeLabel     = DEGREE_TYPE_OPTIONS.find(o => o.value === degreeType)?.[lang]  ?? degreeType;
  const studyYearLabel  = STUDY_YEAR_OPTIONS .find(o => o.value === studyYear)?.[lang]   ?? studyYear;
  const aiStyleLabel    = AI_STYLE_OPTIONS   .find(o => o.value === aiStyle)?.[lang]     ?? aiStyle;
  const showSecondary   = degreeType === 'double' || degreeType === 'specialized';
  const secLabel        = degreeType === 'double' ? t.secondaryMajorDouble : t.secondaryMajorSpec;
  const draftShowSec    = draftDegreeType === 'double' || draftDegreeType === 'specialized';

  const cardStyle = { boxShadow: '0 2px 12px rgba(0,0,0,0.05)' } as const;
  const cardHdr   = { borderBottom: '1px solid rgba(200,190,170,0.45)' } as const;
  const divStyle  = { borderColor: 'rgba(200,190,170,0.35)' } as const;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5F3ED] relative overflow-hidden">

      {/* Background blobs */}
      <div className="absolute top-0 right-[30%] w-[400px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'rgba(107,144,74,0.06)', filter: 'blur(100px)' }} />
      <div className="absolute bottom-0 left-[20%] w-[350px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'rgba(180,160,120,0.05)', filter: 'blur(90px)' }} />

      {/* Language toggle */}
      <button
        onClick={() => setLang(l => l === 'he' ? 'en' : 'he')}
        className="fixed top-5 right-5 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-[#FDFCF8] border border-stone-200 hover:border-[#6B904A]/40 rounded-full text-sm text-slate-600 font-semibold transition-all shadow-sm"
      >
        <svg className="w-4 h-4 text-[#6B904A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        {t.langLabel}
      </button>

      {/* Top nav */}
      <div dir={dir} className="flex items-center justify-between px-6 pt-6 pb-0 max-w-xl mx-auto relative z-10">
        <Link href="/workspace"
          className="flex items-center gap-2 text-slate-500 hover:text-[#6B904A] text-sm font-medium transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          {t.backToApp}
        </Link>
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-slate-900 font-bold text-lg">U-Note</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex items-start justify-center px-4 py-8 min-h-[calc(100vh-80px)] relative z-10">
        <div dir={dir} className="w-full max-w-xl space-y-4">

          {loading ? (
            <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-10 text-center text-slate-500 shadow-sm">
              <div className="w-10 h-10 rounded-full border-2 border-stone-200 border-t-[#6B904A] animate-spin mx-auto mb-4" />
              {t.loading}
            </div>
          ) : (<>

            {/* ── Identity banner ── */}
            <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <div
                className="flex items-center gap-4 px-6 py-5"
                style={{ background: 'linear-gradient(135deg,#F0EDE5 0%,#E8E3D8 100%)', borderBottom: '1px solid #E2DAC8' }}
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-black shrink-0 select-none"
                  style={{ background: 'linear-gradient(135deg,#517B3E 0%,#2A3B22 100%)', boxShadow: '0 4px 14px rgba(81,123,62,0.38)' }}
                >
                  {initials || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-900 text-base font-bold truncate">{firstName} {lastName}</p>
                  <p className="text-slate-500 text-xs mt-0.5 truncate" dir="ltr">{email}</p>
                  {formattedSince && (
                    <p className="text-slate-400 text-[11px] mt-1">{t.memberSince}: {formattedSince}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Tab bar ── */}
            <div
              className="flex gap-1 p-1 rounded-2xl"
              style={{ background: 'rgba(217,235,208,0.55)', border: '1px solid rgba(100,140,80,0.2)' }}
            >
              {(['profile', 'documents'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === 'documents' && !docsLoaded && !loadingDocs) setLoadingDocs(true);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                  style={activeTab === tab
                    ? { background: '#fff', color: '#2A3B22', boxShadow: '0 1px 6px rgba(0,0,0,0.10)' }
                    : { color: '#517B3E' }
                  }
                >
                  {tab === 'profile' ? t.tabProfile : t.tabDocs}
                </button>
              ))}
            </div>

            {/* ════════════════ PROFILE TAB ════════════════ */}
            {activeTab === 'profile' && (
              <div className="space-y-4">

                {/* Personal info card */}
                <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl overflow-hidden" style={cardStyle}>
                  <div className="flex items-center justify-between px-6 py-4" style={cardHdr}>
                    <span className="text-sm font-bold text-[#2A3B22]">{t.personalInfo}</span>
                    {!editingPersonal && (
                      <button
                        onClick={startEditPersonal}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ color: '#517B3E', background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.18)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.08)'; }}
                      >
                        {t.editProfile}
                      </button>
                    )}
                  </div>

                  <div className="px-6 py-5 space-y-3">
                    {personalOk && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                        <CheckIcon /> {personalOk}
                      </div>
                    )}
                    {personalErr && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{personalErr}</div>
                    )}

                    {!editingPersonal ? (
                      <div className="space-y-2.5">
                        {([
                          [t.firstNameLabel, firstName],
                          [t.lastNameLabel,  lastName],
                          [t.emailLabel,     email,    'ltr'],
                        ] as [string, string, string?][]).map(([label, val, d]) => (
                          <div key={label} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                            <p className="text-sm font-medium text-slate-700" dir={d ?? 'auto'}>{val || '—'}</p>
                          </div>
                        ))}

                        {/* Gender row */}
                        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{t.genderLabel}</p>
                          {gender ? (
                            <span
                              className="inline-block text-sm font-medium px-3 py-0.5 rounded-full"
                              style={{ background: 'rgba(81,123,62,0.10)', color: '#2A3B22', border: '1px solid rgba(81,123,62,0.22)' }}
                            >
                              {genderDisplayLabel}
                            </span>
                          ) : (
                            <p className="text-sm text-slate-400">{t.notSet}</p>
                          )}
                        </div>

                        <button
                          onClick={authLogout}
                          className="w-full py-2.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-500 hover:text-red-600 text-sm font-semibold transition-all active:scale-[0.99]"
                        >
                          {t.logout}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.firstNameLabel}</label>
                            <input
                              type="text" value={draftFirst} onChange={e => setDraftFirst(e.target.value)}
                              dir="auto" autoFocus className={INPUT_BASE} style={INPUT_STYLE}
                              onFocus={inputFocus} onBlur={inputBlur}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.lastNameLabel}</label>
                            <input
                              type="text" value={draftLast} onChange={e => setDraftLast(e.target.value)}
                              dir="auto" className={INPUT_BASE} style={INPUT_STYLE}
                              onFocus={inputFocus} onBlur={inputBlur}
                            />
                          </div>
                        </div>
                        <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{t.emailLabel}</p>
                          <p className="text-sm text-slate-500" dir="ltr">{email}</p>
                        </div>

                        {/* Gender pills */}
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-2">{t.genderLabel}</label>
                          <div className="flex flex-wrap gap-2">
                            {GENDER_OPTIONS.map(opt => {
                              const selected = draftGender === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => setDraftGender(selected ? '' : opt.value)}
                                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
                                  style={selected ? {
                                    background: 'rgba(81,123,62,0.12)',
                                    color:      '#2A3B22',
                                    border:     '1.5px solid #517B3E',
                                    boxShadow:  '0 0 0 2px rgba(81,123,62,0.10)',
                                  } : {
                                    background: '#F7F5F0',
                                    color:      '#64748B',
                                    border:     '1.5px solid rgba(200,190,170,0.75)',
                                  }}
                                  onMouseEnter={e => {
                                    if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = '#517B3E';
                                  }}
                                  onMouseLeave={e => {
                                    if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,190,170,0.75)';
                                  }}
                                >
                                  {opt[lang]}
                                </button>
                              );
                            })}
                          </div>
                          {draftGender === 'אחר' && (
                            <p className="text-[11px] text-slate-400 mt-1.5">{t.genderOther}</p>
                          )}
                        </div>

                        <div className="flex gap-3">
                          <button onClick={cancelEditPersonal} disabled={savingPersonal}
                            className="flex-1 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-sm font-semibold text-slate-500 transition-all">
                            {t.cancel}
                          </button>
                          <button
                            onClick={savePersonal}
                            disabled={savingPersonal || !draftFirst.trim() || !draftLast.trim()}
                            className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                            style={{ background: savingPersonal || !draftFirst.trim() || !draftLast.trim() ? '#A8B99A' : '#517B3E' }}
                          >
                            {savingPersonal && <Spinner />}
                            {savingPersonal ? t.saving : t.saveChanges}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Academic settings card */}
                <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl overflow-hidden" style={cardStyle}>
                  <div className="flex items-center justify-between px-6 py-4" style={cardHdr}>
                    <span className="text-sm font-bold text-[#2A3B22]">{t.academicSettings}</span>
                    {!editingAcademic && (
                      <button
                        onClick={startEditAcademic}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                        style={{ color: '#517B3E', background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.18)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.08)'; }}
                      >
                        {t.editAcademic}
                      </button>
                    )}
                  </div>

                  <div className="px-6 py-5 space-y-3">
                    {academicOk && (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                        <CheckIcon /> {academicOk}
                      </div>
                    )}
                    {academicErr && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{academicErr}</div>
                    )}

                    {!editingAcademic ? (
                      /* ── Read-only view ── */
                      <div className="space-y-2">
                        {[
                          { icon: '🏛️', label: t.institutionLabel,  val: institution   || t.notSet },
                          { icon: '📅', label: t.studyYearLabel,    val: studyYearLabel || t.notSet },
                          { icon: '🎓', label: t.degreeTypeLabel,   val: degreeLabel    || t.notSet },
                          { icon: '📚', label: t.primaryMajorLabel, val: primaryMajor  || t.notSet },
                          ...(showSecondary
                            ? [{ icon: '📖', label: secLabel, val: secondaryMajor || t.notSet }]
                            : []),
                          { icon: '🤖', label: t.aiStyleLabel,      val: aiStyleLabel   || t.notSet },
                        ].map(({ icon, label, val }) => (
                          <div key={label} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                            <span className="text-base leading-none mt-0.5 shrink-0">{icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                              <p className="text-sm font-medium text-slate-700">{val}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* ── Edit form ── */
                      <div className="space-y-4">

                        {/* Institution */}
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.institutionLabel}</label>
                          <input
                            type="text" value={draftInstitution}
                            onChange={e => setDraftInstitution(e.target.value)}
                            dir="auto" placeholder={t.institutionLabel}
                            className={INPUT_BASE} style={INPUT_STYLE}
                            onFocus={inputFocus} onBlur={inputBlur}
                          />
                        </div>

                        {/* Study year */}
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.studyYearLabel}</label>
                          <div className="relative">
                            <select
                              value={draftStudyYear}
                              onChange={e => setDraftStudyYear(e.target.value)}
                              className={`${INPUT_BASE} appearance-none`} style={INPUT_STYLE}
                              onFocus={inputFocus} onBlur={inputBlur}
                            >
                              <option value="">{t.selectPh}</option>
                              {STUDY_YEAR_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o[lang]}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                              <ChevronDown />
                            </span>
                          </div>
                        </div>

                        {/* Degree type */}
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.degreeTypeLabel}</label>
                          <div className="relative">
                            <select
                              value={draftDegreeType}
                              onChange={e => {
                                const v = e.target.value;
                                setDraftDegreeType(v);
                                if (v !== 'double' && v !== 'specialized') setDraftSecondaryMajor('');
                              }}
                              className={`${INPUT_BASE} appearance-none`} style={INPUT_STYLE}
                              onFocus={inputFocus} onBlur={inputBlur}
                            >
                              <option value="">{t.selectPh}</option>
                              {DEGREE_TYPE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o[lang]}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                              <ChevronDown />
                            </span>
                          </div>
                        </div>

                        {/* Primary major */}
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.primaryMajorLabel}</label>
                          <input
                            type="text" value={draftPrimaryMajor}
                            onChange={e => setDraftPrimaryMajor(e.target.value)}
                            dir="auto" className={INPUT_BASE} style={INPUT_STYLE}
                            onFocus={inputFocus} onBlur={inputBlur}
                          />
                        </div>

                        {/* Secondary major — only for double/specialized */}
                        {draftShowSec && (
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">
                              {draftDegreeType === 'double' ? t.secondaryMajorDouble : t.secondaryMajorSpec}
                            </label>
                            <input
                              type="text" value={draftSecondaryMajor}
                              onChange={e => setDraftSecondaryMajor(e.target.value)}
                              dir="auto" className={INPUT_BASE} style={INPUT_STYLE}
                              onFocus={inputFocus} onBlur={inputBlur}
                            />
                          </div>
                        )}

                        {/* AI style */}
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.aiStyleLabel}</label>
                          <div className="relative">
                            <select
                              value={draftAiStyle}
                              onChange={e => setDraftAiStyle(e.target.value)}
                              className={`${INPUT_BASE} appearance-none`} style={INPUT_STYLE}
                              onFocus={inputFocus} onBlur={inputBlur}
                            >
                              <option value="">{t.selectPh}</option>
                              {AI_STYLE_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o[lang]}</option>
                              ))}
                            </select>
                            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                              <ChevronDown />
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3 pt-1">
                          <button onClick={cancelEditAcademic} disabled={savingAcademic}
                            className="flex-1 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-sm font-semibold text-slate-500 transition-all">
                            {t.cancelAcademic}
                          </button>
                          <button
                            onClick={saveAcademic} disabled={savingAcademic}
                            className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                            style={{ background: savingAcademic ? '#A8B99A' : '#517B3E' }}
                          >
                            {savingAcademic && <Spinner />}
                            {savingAcademic ? t.savingAcademic : t.saveAcademic}
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                </div>

                {/* Stats card */}
                <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl overflow-hidden" style={cardStyle}>
                  <div className="px-6 py-5 space-y-4">

                    {/* Progress bars */}
                    <UsageBar label={t.uploadsLabel}   used={uploadsUsed}   limit={null} unlimited={t.unlimited} />
                    <UsageBar label={t.questionsLabel} used={questionsUsed} limit={null} unlimited={t.unlimited} />

                    {/* Divider */}
                    <div className="h-px" style={{ background: 'rgba(200,190,170,0.4)' }} />

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        [t.statChats,    sessionCount],
                        [t.statMessages, messageCount],
                        [t.statDocs,     documentCount],
                      ] as [string, number][]).map(([label, val]) => (
                        <div
                          key={label}
                          className="flex flex-col items-center gap-1 rounded-xl py-3 px-2"
                          style={{ background: 'rgba(81,123,62,0.05)', border: '1px solid rgba(81,123,62,0.12)' }}
                        >
                          <span className="text-xl font-bold text-[#2A3B22]">{val}</span>
                          <span className="text-xs text-slate-500">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ════════════════ DOCUMENTS TAB ════════════════ */}
            {activeTab === 'documents' && (
              <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl overflow-hidden" style={cardStyle}>
                <div className="flex items-center justify-between px-6 py-4" style={cardHdr}>
                  <span className="text-sm font-bold text-[#2A3B22]">{t.myDocs}</span>
                  {documents.length > 0 && (
                    <span className="text-xs text-slate-400">
                      {documents.length} {he ? 'מסמכים' : 'documents'}
                      {documents.some(d => d.file_size_bytes) && (
                        <> · {formatBytes(documents.reduce((s, d) => s + (d.file_size_bytes ?? 0), 0))} {he ? 'סה״כ' : 'total'}</>
                      )}
                    </span>
                  )}
                </div>

                {docErr && (
                  <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{docErr}</div>
                )}

                {loadingDocs ? (
                  <div className="p-10 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full border-2 border-stone-200 border-t-[#6B904A] animate-spin" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="p-10 text-center">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                      style={{ background: 'rgba(81,123,62,0.08)' }}
                    >
                      <DocIcon className="w-7 h-7 text-[#517B3E]" />
                    </div>
                    <p className="text-sm text-slate-400">{t.noDocuments}</p>
                  </div>
                ) : (<>
                  {/* Column headers */}
                  <div
                    className="flex items-center gap-3 px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                    style={divStyle}
                  >
                    <span className="flex-1 min-w-0">{t.docName}</span>
                    <span className="w-28 text-center shrink-0">{t.docDate}</span>
                    <span className="w-16 text-center shrink-0">{t.docSize}</span>
                    <span className="w-8 shrink-0" />
                  </div>
                  {/* Rows */}
                  <div className="divide-y" style={divStyle}>
                    {documents.map(doc => (
                      <div
                        key={doc.file_id}
                        className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-stone-50/70"
                      >
                        {/* Icon + name */}
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'rgba(81,123,62,0.08)' }}
                          >
                            <DocIcon className="w-4 h-4 text-[#517B3E]" />
                          </div>
                          <p className="text-sm font-medium text-slate-700 truncate" title={doc.filename}>
                            {doc.filename}
                          </p>
                        </div>
                        {/* Date */}
                        <span className="text-xs text-slate-400 w-28 text-center shrink-0" dir="ltr">
                          {formatDate(doc.uploaded_at, lang)}
                        </span>
                        {/* Size */}
                        <span className="text-xs text-slate-400 w-16 text-center shrink-0" dir="ltr">
                          {formatBytes(doc.file_size_bytes)}
                        </span>
                        {/* Delete */}
                        <button
                          onClick={() => setDocToDelete(doc)}
                          disabled={!!deletingDocId}
                          title={t.deleteDoc}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0"
                          style={{
                            color:      deletingDocId === doc.file_id ? '#9ca3af' : '#dc2626',
                            background: deletingDocId === doc.file_id ? 'rgba(156,163,175,0.1)' : 'rgba(220,38,38,0.06)',
                          }}
                          onMouseEnter={e => {
                            if (!deletingDocId) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.14)';
                          }}
                          onMouseLeave={e => {
                            if (!deletingDocId) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)';
                          }}
                        >
                          {deletingDocId === doc.file_id ? (
                            <Spinner className="w-3.5 h-3.5 border-gray-300/50 border-t-gray-400" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round"
                                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </>)}
              </div>
            )}

          </>)}
        </div>
      </div>

      {/* Delete-document confirmation */}
      {docToDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{
            backgroundColor: isDeleteModalClosing ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.45)',
            backdropFilter:  isDeleteModalClosing ? 'blur(0px)' : 'blur(8px)',
            transition: 'background-color 0.18s ease, backdrop-filter 0.18s ease',
          }}
          onClick={e => { if (e.target === e.currentTarget && !deletingDocId) closeDeleteModal(); }}
        >
          <div
            dir={dir}
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.98)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(220,38,38,0.18)',
              boxShadow: '0 20px 60px rgba(30,10,10,0.22), 0 4px 16px rgba(220,38,38,0.08)',
              opacity:   isDeleteModalClosing ? 0 : 1,
              transform: isDeleteModalClosing ? 'scale(0.93) translateY(8px)' : 'scale(1) translateY(0)',
              transition: 'opacity 0.16s ease, transform 0.16s cubic-bezier(0.4,0,1,1)',
            }}
          >
            <div
              className="flex items-center gap-3 px-5 py-4"
              style={{ background: 'rgba(220,38,38,0.04)', borderBottom: '1px solid rgba(220,38,38,0.12)' }}
            >
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={!!deletingDocId}
                aria-label={t.cancel}
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.2)' }}
              >
                <svg className="w-5 h-5 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
              <h2 className="flex-1 text-base font-bold text-[#1a2e14]">{t.deleteDocTitle}</h2>
            </div>

            <div className="px-5 py-5">
              <p className="text-sm text-[#4a5e3a] leading-relaxed">
                {t.deleteDocBody(docToDelete.filename)}
              </p>
            </div>

            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={closeDeleteModal}
                disabled={!!deletingDocId}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50"
                style={{ color: '#7a9268', borderColor: 'rgba(157,192,139,0.45)', background: 'transparent' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.06)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                {t.cancel}
              </button>
              <button
                onClick={() => handleDeleteDoc(docToDelete.file_id)}
                disabled={!!deletingDocId}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white disabled:opacity-70"
                style={{ background: '#dc2626', boxShadow: '0 4px 14px rgba(220,38,38,0.30)' }}
              >
                {deletingDocId ? t.deleting : t.deleteDoc}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  );
}
