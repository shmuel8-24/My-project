'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth }       from '../providers/auth';
import { useLanguage }   from '../providers/language';
import { useCourse }     from '../providers/course';
import NoCourseState     from '../../components/NoCourseState';
import CoursePill        from '../../components/CoursePill';
import Skeleton          from '../../components/ui/Skeleton';
import { playSuccess }   from '../../utils/audio';

const API = 'http://127.0.0.1:5003';

/* ── Auth helpers ─────────────────────────────────────────────────────────────── */
function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('levy_ai_token') : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

/* ── Quiz types ───────────────────────────────────────────────────────────────── */
type QuizState = 'closed' | 'loading' | 'active' | 'done' | 'error';
type SubmitState = 'idle' | 'loading' | 'success' | 'error';

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
}

/* ── Shared micro-components ─────────────────────────────────────────────────── */
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />
  );
}

function Spinner({ large = false }: { large?: boolean }) {
  const cls = large
    ? 'w-10 h-10 border-4 border-[#9DC08B]/30 border-t-[#517B3E]'
    : 'w-5 h-5 border-2 border-[#9DC08B]/30 border-t-[#517B3E]';
  return <span className={`inline-block rounded-full animate-spin ${cls}`} />;
}

function AvatarContent({ gender, initials }: { gender: string; initials: string }) {
  if (gender === 'זכר') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" style={{ width: '62%', height: '62%' }}>
        <circle cx="9.5" cy="13" r="5.8" />
        <line x1="14" y1="8.5" x2="20" y2="3" />
        <polyline points="15.5 3 20 3 20 7.5" />
      </svg>
    );
  }
  if (gender === 'נקבה') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" style={{ width: '62%', height: '62%' }}>
        <circle cx="12" cy="8.5" r="5.8" />
        <line x1="12" y1="14.3" x2="12" y2="20.5" />
        <line x1="9" y1="17.5" x2="15" y2="17.5" />
      </svg>
    );
  }
  return <>{initials || '?'}</>;
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function LogoutConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(42,59,34,0.45)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(157,192,139,0.3)', boxShadow: '0 24px 64px rgba(20,40,15,0.25)' }}
      >
        <div className="px-6 pt-6 pb-2">
          <h2 className="font-bold text-[#1a2e14] text-lg">יציאה מהמערכת</h2>
          <p className="text-sm text-[#7a9268] mt-1">האם אתה בטוח שברצונך להתנתק ולצאת?</p>
        </div>
        <div className="flex gap-2 px-6 py-4">
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: '#dc2626' }}>
            כן, צא
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: 'rgba(81,123,62,0.1)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.2)' }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Quiz Modal ───────────────────────────────────────────────────────────────── */
interface QuizModalProps {
  state: QuizState;
  topic: string;
  questions: QuizQuestion[];
  current: number;
  score: number;
  selected: number | null;
  error: string | null;
  he: boolean;
  onSelect: (idx: number) => void;
  onNext: () => void;
  onClose: () => void;
  onRetry: (topic: string) => void;
  submitState: SubmitState;
  newMasteryPct: number | null;
}

function MasteryQuizModal({
  state, topic, questions, current, score, selected, error, he,
  onSelect, onNext, onClose, onRetry,
  submitState, newMasteryPct,
}: QuizModalProps) {
  if (state === 'closed') return null;

  const q       = state === 'active' && questions.length > 0 ? questions[current] : null;
  const isLast  = current === questions.length - 1;
  const quizPct = questions.length > 0 ? (score / questions.length) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(42,59,34,0.52)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-lg rounded-3xl flex flex-col overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.98)',
          border: '1px solid rgba(157,192,139,0.3)',
          boxShadow: '0 32px 80px rgba(20,40,15,0.28)',
          maxHeight: '90vh',
        }}
      >

        {/* ── Loading ────────────────────────────────────────────────────────── */}
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-5 px-8 py-14 text-center">
            <Spinner large />
            <div className="space-y-2">
              <p className="font-bold text-[#1a2e14] text-base">🎯 {topic}</p>
              <p className="text-sm text-[#7a9268] leading-relaxed max-w-xs">
                {he
                  ? 'הבינה המלאכותית מייצרת עבורך מבחן מותאם אישית...'
                  : 'The AI is generating your personalised quiz…'}
              </p>
            </div>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {state === 'error' && (
          <div className="flex flex-col items-center gap-5 px-8 py-12 text-center">
            <span className="text-4xl leading-none">⚠️</span>
            <div className="space-y-2">
              <p className="font-bold text-[#1a2e14] text-base">
                {he ? 'שגיאה ביצירת המבחן' : 'Quiz generation failed'}
              </p>
              <p className="text-sm text-red-500 leading-relaxed max-w-xs">{error}</p>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: 'rgba(81,123,62,0.1)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.2)' }}
            >
              {he ? 'סגור' : 'Close'}
            </button>
          </div>
        )}

        {/* ── Active: question ───────────────────────────────────────────────── */}
        {state === 'active' && q && (
          <>
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0"
              style={{ borderBottom: '1px solid rgba(157,192,139,0.2)' }}>
              <div>
                <p className="text-[11px] font-semibold text-[#7a9268] uppercase tracking-widest">
                  {he
                    ? `שאלה ${current + 1} מתוך ${questions.length}`
                    : `Question ${current + 1} of ${questions.length}`}
                </p>
                <p className="text-xs text-[#7a9268] mt-0.5 max-w-[220px] truncate">🎯 {topic}</p>
              </div>
              {/* Progress dots */}
              <div className="flex gap-1.5 shrink-0">
                {questions.map((_, i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full transition-colors duration-300"
                    style={{
                      background: i < current ? '#517B3E' : i === current ? '#2A3B22' : 'rgba(81,123,62,0.18)',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Question + Options */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
              <p
                className="text-[#1a2e14] font-semibold text-base leading-relaxed"
                dir={he ? 'rtl' : 'ltr'}
              >
                {q.question}
              </p>

              <div className="flex flex-col gap-2.5" dir={he ? 'rtl' : 'ltr'}>
                {q.options.map((opt, idx) => {
                  const isCorrect  = idx === q.correct_answer;
                  const isSelected = selected === idx;
                  const revealed   = selected !== null;

                  let bg     = 'rgba(245,251,240,0.7)';
                  let border = 'rgba(157,192,139,0.3)';
                  let color  = '#2d3b25';

                  if (revealed) {
                    if (isCorrect)       { bg = 'rgba(81,123,62,0.12)'; border = '#517B3E'; color = '#1a3d10'; }
                    else if (isSelected) { bg = 'rgba(239,68,68,0.08)'; border = '#ef4444'; color = '#991b1b'; }
                  } else if (isSelected) {
                    bg = 'rgba(81,123,62,0.10)'; border = '#517B3E';
                  }

                  return (
                    <button
                      key={idx}
                      disabled={revealed}
                      onClick={() => onSelect(idx)}
                      className="w-full text-start px-4 py-3 rounded-xl text-sm font-medium transition-all [&:not(:disabled):hover]:brightness-[0.96] [&:not(:disabled):active]:scale-[0.99]"
                      style={{
                        background: bg,
                        border: `1.5px solid ${border}`,
                        color,
                        cursor: revealed ? 'default' : 'pointer',
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Inline feedback */}
              {selected !== null && (
                <p
                  className="text-sm font-semibold text-center"
                  style={{ color: selected === q.correct_answer ? '#517B3E' : '#ef4444' }}
                >
                  {selected === q.correct_answer
                    ? (he ? '✓ נכון!' : '✓ Correct!')
                    : (he ? '✗ לא נכון' : '✗ Incorrect')}
                </p>
              )}
            </div>

            {/* Footer */}
            <div
              className="px-6 py-4 flex justify-end shrink-0"
              style={{ borderTop: '1px solid rgba(157,192,139,0.2)' }}
            >
              <button
                disabled={selected === null}
                onClick={onNext}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #517B3E, #2A3B22)',
                  boxShadow: selected !== null ? '0 2px 10px rgba(81,123,62,0.30)' : 'none',
                }}
              >
                {isLast ? (he ? 'סיים' : 'Finish') : (he ? 'הבא →' : 'Next →')}
              </button>
            </div>
          </>
        )}

        {/* ── Done: score ────────────────────────────────────────────────────── */}
        {state === 'done' && (
          <div className="flex flex-col items-center gap-5 px-8 py-12 text-center">
            <span className="text-5xl leading-none select-none">
              {quizPct >= 80 ? '🌟' : quizPct >= 50 ? '🎉' : '💪'}
            </span>

            <div className="space-y-1.5">
              <p className="text-3xl font-extrabold text-[#1a2e14]">{score}/{questions.length}</p>
              <p className="text-sm text-[#7a9268] leading-relaxed max-w-xs">
                {he
                  ? quizPct >= 80
                    ? 'שליטה מעולה! הוכחת הבנה עמוקה בנושא זה.'
                    : quizPct >= 50
                    ? 'בדרך הנכונה! יש עוד כמה דקויות לחדד, המדד עודכן.'
                    : 'חלק מהמושגים עדיין לא יושבים טוב. מומלץ לעבור שוב על סיכומי ה-RAG ולנסות שוב.'
                  : quizPct >= 80
                  ? 'Excellent mastery! You demonstrated deep understanding.'
                  : quizPct >= 50
                  ? 'On the right track! A few nuances left to refine — meter updated.'
                  : 'Some concepts need more work. Review your RAG summaries and try again.'}
              </p>
            </div>

            {submitState === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-[#7a9268]">
                <Spinner />
                {he ? 'מעדכן מדד שליטה...' : 'Updating mastery score…'}
              </div>
            )}
            {submitState === 'success' && newMasteryPct !== null && (
              <div
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{
                  background: `${gapColor(newMasteryPct)}18`,
                  color: gapColor(newMasteryPct),
                  border: `1px solid ${gapColor(newMasteryPct)}40`,
                }}
              >
                {he
                  ? `📊 מדד שליטה עודכן ל־${Math.round(newMasteryPct)}%`
                  : `📊 Mastery updated to ${Math.round(newMasteryPct)}%`}
              </div>
            )}

            <div className="flex gap-2 mt-1 w-full max-w-xs">
              <button
                onClick={() => onRetry(topic)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ background: 'rgba(81,123,62,0.1)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.2)' }}
              >
                {he ? 'חידון חדש' : 'New Quiz'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #517B3E, #2A3B22)' }}
              >
                {he ? 'סגור' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Gap card types ───────────────────────────────────────────────────────────── */
interface GapCard {
  id: string;             // file_id (MD5 hex from UserDocument)
  icon: string;
  topic: string;
  mastery: number | null; // null = never quizzed
  quiz_count: number;
}

function gapColor(m: number | null): string {
  if (m === null) return '#94a3b8';
  if (m < 40) return '#ef4444';
  if (m < 65) return '#f97316';
  return '#517B3E';
}

function gapLabel(m: number | null, he: boolean): string {
  if (m === null) return he ? 'לא נבדקת' : 'Not tested';
  if (m < 40) return he ? 'פער גבוה' : 'High gap';
  if (m < 65) return he ? 'פער בינוני' : 'Moderate gap';
  return he ? 'פער נמוך' : 'Low gap';
}

/* ── Knowledge gap card ──────────────────────────────────────────────────────── */
function GapCardUI({ card, he, onTest }: {
  card: GapCard;
  he: boolean;
  onTest: (topic: string, fileId: string) => void;
}) {
  const color = gapColor(card.mastery);
  const label = gapLabel(card.mastery, he);

  return (
    <div
      className="w-full flex flex-col gap-5 p-6"
      style={{
        background: 'rgba(255,255,255,0.52)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        borderRadius: '20px',
        borderTop: '1px solid rgba(255,255,255,0.58)',
        borderBottom: '1px solid rgba(255,255,255,0.22)',
        borderInlineEnd: '1px solid rgba(255,255,255,0.22)',
        borderInlineStart: `4px solid ${color}`,
        boxShadow: '0 4px 24px rgba(60,90,40,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-inline-start-color 0.7s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(60,90,40,0.14), inset 0 1px 0 rgba(255,255,255,0.65)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(60,90,40,0.08), inset 0 1px 0 rgba(255,255,255,0.6)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-xl leading-none"
            style={{ background: `${color}12`, border: `1px solid ${color}22` }}
          >
            {card.icon}
          </div>
          <div className="min-w-0 flex flex-col gap-1">
            <h3 className="text-base font-bold text-[#1a2e14] leading-snug">{card.topic}</h3>
            <span
              className="inline-flex items-center gap-1 self-start text-[10px] font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: 'rgba(81,123,62,0.10)', color: '#2A3B22', border: '1px solid rgba(81,123,62,0.15)' }}
            >
              📚 {he ? 'חומר לימוד' : 'Study material'}
            </span>
          </div>
        </div>
        <span
          className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full"
          style={{ background: `${color}14`, color, border: `1px solid ${color}28`, boxShadow: `0 2px 10px ${color}1A` }}
        >
          {label}
        </span>
      </div>

      {/* Gradient mastery bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="font-medium text-[#7a9268]">{he ? 'שליטה בנושא' : 'Topic mastery'}</span>
          <span className="font-bold tabular-nums text-sm" style={{ color }}>
            {card.mastery !== null ? `${card.mastery}%` : '—'}
          </span>
        </div>
        <div
          className="h-3 rounded-full overflow-hidden relative"
          style={{ background: 'rgba(81,123,62,0.07)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
        >
          {card.mastery !== null && card.mastery > 0 && (
            <>
              <div style={{
                position: 'absolute', inset: 0,
                width: `${card.mastery}%`,
                background: 'linear-gradient(90deg,#ef4444,#f97316 32%,#eab308 58%,#84cc16 80%,#517B3E)',
                filter: 'blur(6px)',
                opacity: 0.38,
                transition: 'width 0.85s cubic-bezier(0.4,0,0.2,1)',
              }} />
              <div
                className="animate-mastery-pulse"
                style={{
                  position: 'absolute', inset: 0,
                  width: `${card.mastery}%`,
                  background: 'linear-gradient(90deg,#ef4444,#f97316 32%,#eab308 58%,#84cc16 80%,#517B3E)',
                  borderRadius: '9999px',
                  transition: 'width 0.85s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            </>
          )}
        </div>
        {card.quiz_count > 0 ? (
          <p className="text-[11px] font-medium" style={{ color: '#9aaf8a' }}>
            {he
              ? `✓ ${card.quiz_count} חידון${card.quiz_count !== 1 ? 'ים' : ''} הושלמ${card.quiz_count !== 1 ? 'ו' : ''}`
              : `✓ ${card.quiz_count} quiz${card.quiz_count !== 1 ? 'zes' : ''} completed`}
          </p>
        ) : (
          <p className="text-[11px] font-medium" style={{ color: '#b0c4a5' }}>
            {he ? '◦ עדיין לא נבדקת — לחץ להתחלה' : '◦ Never tested — press to begin'}
          </p>
        )}
      </div>

      {/* Gamified CTA */}
      <div className="flex flex-col items-start gap-1.5 mt-1">
        <button
          onClick={() => onTest(card.topic, card.id)}
          className="animate-jewel-glow flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform duration-150"
          style={{
            background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)',
            boxShadow: '0 4px 20px rgba(81,123,62,0.38)',
            transition: 'box-shadow 0.18s ease, transform 0.12s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(81,123,62,0.58)';
            e.currentTarget.style.transform = 'scale(1.03)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(81,123,62,0.38)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
        >
          <span className="text-base leading-none">🤖</span>
          {he ? 'בדוק אותי בנושא' : 'Quiz me on this'}
        </button>
        <p className="text-[11px] ps-1" style={{ color: '#9aaf8a' }}>
          {he ? '🤖 הבינה המלאה-100.' : '🤖 AI-powered mastery to 100.'}
        </p>
      </div>
    </div>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────────────────────── */
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  lang: 'he' | 'en';
  userFirstName: string;
  userLastName: string;
  userEmail: string;
  userGender: string;
  userInitials: string;
  onRequestLogout: () => void;
}

function MasterySidebar({
  isOpen, onClose, isAdmin, lang,
  userFirstName, userLastName, userEmail, userGender, userInitials,
  onRequestLogout,
}: SidebarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const he = lang === 'he';
  const translateClass = isOpen ? 'translate-x-0' : he ? 'translate-x-full' : '-translate-x-full';

  return (
    <>
      {/* Backdrop */}
      <div
        className={['fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'].join(' ')}
        style={{ backgroundColor: 'rgba(42,59,34,0.35)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={['fixed inset-y-0 start-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out', translateClass].join(' ')}
        style={{
          backgroundColor: 'rgba(217,235,208,0.97)',
          backdropFilter: 'blur(20px)',
          borderInlineEnd: '1px solid rgba(100,140,80,0.25)',
          boxShadow: '4px 0 32px rgba(60,90,40,0.12)',
        }}
      >
        {/* Logo header */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0"
          style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
          <LogoMark size={36} />
          <button onClick={onClose} aria-label={he ? 'סגור תפריט' : 'Close menu'}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0">
            <svg className="w-4 h-4 text-[#4a5e3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-3 py-3 space-y-1 shrink-0"
            style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
            <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-2 mb-2">Navigation</p>

            <button onClick={() => { router.push('/dashboard'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🏠</span>
              {he ? 'בית' : 'Home'}
            </button>

            <button onClick={() => { router.push('/workspace'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🌱</span>
              {he ? 'מרחב לימוד' : 'StudyLab'}
            </button>

            <button onClick={() => { router.push('/workspace/professor-simulator'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🧠</span>
              {he ? 'הראש של המרצה' : "Professor's Brain"}
            </button>

            {/* Mastery — active */}
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 }}
            >
              <span className="text-base leading-none shrink-0">🎯</span>
              {he ? 'שליטה בחומר' : 'Mastery'}
            </button>

            <button disabled
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#7a9268] text-sm cursor-not-allowed opacity-50">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
              Collaboration
              <span className="ms-auto text-[10px] bg-[#517B3E]/15 text-[#517B3E] px-1.5 py-0.5 rounded-full font-medium">Soon</span>
            </button>
          </div>

          <div className="flex-1" />

          {/* Admin CT */}
          {isAdmin && (
            <div className="px-3 py-3 shrink-0 space-y-0.5"
              style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>
              <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-2 mb-2">Admin CT</p>
              <button onClick={() => { router.push('/dashboard'); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/dashboard' ? 'border' : 'hover:bg-[#517B3E]/10 text-[#2d3b25]'}`}
                style={pathname === '/dashboard' ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 } : undefined}>
                <span className="text-base leading-none shrink-0">🖥️</span>
                Platform
              </button>
              <button onClick={() => { router.push('/admin'); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/admin' ? 'border' : 'hover:bg-[#517B3E]/10 text-[#7a9268] hover:text-[#2d3b25]'}`}
                style={pathname === '/admin' ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 } : undefined}>
                <IconShield className="w-4 h-4 shrink-0" />
                Admin
              </button>
            </div>
          )}
        </div>

        {/* Bottom: Logout + profile */}
        <div className="shrink-0 px-3 pt-2 pb-2.5"
          style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>
          <button
            dir={he ? 'rtl' : 'ltr'}
            onClick={() => { onClose(); onRequestLogout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[#7a9268] hover:bg-red-50 hover:text-red-500 mb-1"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            <span className="text-sm font-medium">{he ? 'יציאה' : 'Logout'}</span>
          </button>

          <button
            dir={he ? 'rtl' : 'ltr'}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-[#517B3E]/10 active:scale-[0.99] group"
            style={{ textAlign: 'start' }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 select-none"
              style={{ background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)' }}
            >
              <AvatarContent gender={userGender} initials={userInitials} />
            </div>
            <div className="flex-1 min-w-0 text-start">
              <p className="text-sm font-semibold text-[#2d3b25] truncate leading-snug">{userFirstName} {userLastName}</p>
              <p className="text-[11px] text-[#7a9268] truncate">{userEmail}</p>
            </div>
            <svg className="w-4 h-4 text-[#7a9268] shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────────── */
export default function MasteryPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const { selectedCourse } = useCourse();
  const he = lang === 'he';

  // ── Shell state ────────────────────────────────────────────────────────────
  const [sidebarOpen,        setSidebarOpen]        = useState(false);
  const [showLogoutModal,    setShowLogoutModal]    = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const profilePopoverRef = useRef<HTMLDivElement>(null);
  const [headerScrolled, setHeaderScrolled] = useState(false);

  // ── Topics state (dynamic, from backend) ──────────────────────────────────
  const [topics,        setTopics]        = useState<GapCard[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);

  // ── Quiz state ─────────────────────────────────────────────────────────────
  const [quizState,     setQuizState]     = useState<QuizState>('closed');
  const [quizTopic,     setQuizTopic]     = useState('');
  const [quizFileId,    setQuizFileId]    = useState('');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizCurrent,   setQuizCurrent]   = useState(0);
  const [quizScore,     setQuizScore]     = useState(0);
  const [quizSelected,  setQuizSelected]  = useState<number | null>(null);
  const [quizError,     setQuizError]     = useState<string | null>(null);
  const [submitState,   setSubmitState]   = useState<SubmitState>('idle');
  const [newMasteryPct, setNewMasteryPct] = useState<number | null>(null);

  // ── User info ──────────────────────────────────────────────────────────────
  const [isAdmin] = useState(() => {
    if (typeof window === 'undefined') return false;
    const token = localStorage.getItem('levy_ai_token');
    if (!token) return false;
    const p = decodeJwtPayload(token);
    return p?.is_admin === true;
  });
  const [userEmail]     = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_email')      ?? '') : '');
  const [userFirstName] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_first_name') ?? '') : '');
  const [userLastName]  = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_last_name')  ?? '') : '');
  const [userGender]    = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_gender')     ?? '') : '');

  const userInitials = [userFirstName[0], userLastName[0]].filter(Boolean).join('').toUpperCase()
    || (userEmail ? userEmail.slice(0, 2).toUpperCase() : '?');

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  // ── Header scroll depth ────────────────────────────────────────────────────
  useEffect(() => {
    function onScroll() { setHeaderScrolled(window.scrollY > 4); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Click-outside profile popover ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node))
        setProfilePopoverOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Esc key ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setProfilePopoverOpen(false);
        setShowLogoutModal(false);
        if (quizState !== 'loading') setQuizState('closed');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quizState]);

  // ── Load topics + mastery scores from backend ─────────────────────────────
  useEffect(() => {
    if (!authUser) return;
    const token = getToken();
    const courseParam = selectedCourse ? `?course=${selectedCourse.id}` : '';
    const request = token
      ? fetch(`${API}/api/mastery/topics${courseParam}`, { headers: { Authorization: `Bearer ${token}` } })
      : Promise.resolve(null);
    request
      .then(r => (r && r.ok) ? r.json() : [])
      .then((data: { file_id: string; topic: string; icon: string; mastery_pct: number | null; quiz_count: number }[]) => {
        setTopics((data ?? []).map(d => ({
          id:         d.file_id,
          icon:       d.icon,
          topic:      d.topic,
          mastery:    d.mastery_pct !== null ? Math.round(d.mastery_pct) : null,
          quiz_count: d.quiz_count,
        })));
        setTopicsLoading(false);
      })
      .catch(() => { setTopicsLoading(false); });
  }, [authUser, selectedCourse]);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    ['levy_ai_token','levy_ai_email','levy_ai_first_name','levy_ai_last_name',
     'levy_ai_institution','levy_ai_primary_major','levy_ai_degree_type',
     'levy_ai_country','levy_ai_secondary_major','levy_ai_gender',
    ].forEach(k => localStorage.removeItem(k));
    document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
    window.location.href = '/';
  }, []);

  // ── Submit quiz results & update mastery in DB ────────────────────────────
  const submitResults = useCallback(async (topic: string, fileId: string, score: number, total: number) => {
    if (!fileId || total === 0) return;
    setSubmitState('loading');
    setNewMasteryPct(null);
    try {
      const token = getToken();
      const res = await fetch(`${API}/api/mastery/submit-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ topic, file_id: fileId, score, total }),
      });
      if (!res.ok) throw new Error('submit failed');
      const data = await res.json() as { mastery_pct: number; file_id: string };
      setNewMasteryPct(data.mastery_pct);
      setSubmitState('success');
      if (score / total >= 0.9) {
        playSuccess();
        void import('canvas-confetti').then(({ default: confetti }) => {
          void confetti({
            particleCount: 80, spread: 65, startVelocity: 28,
            gravity: 0.70, decay: 0.93, ticks: 350,
            colors: ['#4ADE80', '#D1E6D9', '#1C3329', '#F9DE8B'],
            shapes: ['circle', 'square'],
            origin: { y: 0.65 },
          });
          setTimeout(() => void confetti({
            particleCount: 40, spread: 90, startVelocity: 18,
            gravity: 0.50, decay: 0.95, ticks: 300,
            colors: ['#4ADE80', '#F9DE8B', '#D1E6D9'],
            shapes: ['circle'],
            origin: { x: 0.20, y: 0.75 },
          }), 350);
          setTimeout(() => void confetti({
            particleCount: 35, spread: 85, startVelocity: 16,
            gravity: 0.45, decay: 0.95, ticks: 300,
            colors: ['#4ADE80', '#F9DE8B'],
            shapes: ['circle'],
            origin: { x: 0.80, y: 0.75 },
          }), 500);
        });
      }
      setTopics(prev => prev.map(t =>
        t.id === data.file_id
          ? { ...t, mastery: Math.round(data.mastery_pct), quiz_count: t.quiz_count + 1 }
          : t
      ));
    } catch {
      setSubmitState('error');
    }
  }, []);

  // ── Start quiz: fetch from RAG backend ────────────────────────────────────
  const startQuiz = useCallback(async (topic: string, fileId: string) => {
    setQuizTopic(topic);
    setQuizFileId(fileId);
    setQuizQuestions([]);
    setQuizCurrent(0);
    setQuizScore(0);
    setQuizSelected(null);
    setQuizError(null);
    setQuizState('loading');
    setSubmitState('idle');
    setNewMasteryPct(null);

    try {
      const token = getToken();
      const res   = await fetch(`${API}/api/mastery/generate-quiz`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ topic, file_id: fileId }),
      });

      const data = await res.json() as { questions?: QuizQuestion[]; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? `שגיאת שרת ${res.status}`);
      }
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error(he ? 'לא התקבלו שאלות מהשרת' : 'No questions returned from the server');
      }

      setQuizQuestions(data.questions);
      setQuizState('active');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setQuizError(msg);
      setQuizState('error');
    }
  }, [he]);

  // ── Quiz: select answer ────────────────────────────────────────────────────
  const handleQuizSelect = useCallback((idx: number) => {
    if (quizSelected !== null) return;
    setQuizSelected(idx);
  }, [quizSelected]);

  // ── Quiz: advance / finish ─────────────────────────────────────────────────
  const handleQuizNext = useCallback(() => {
    if (quizSelected === null || quizQuestions.length === 0) return;
    const correct  = quizSelected === quizQuestions[quizCurrent].correct_answer;
    const newScore = quizScore + (correct ? 1 : 0);

    if (quizCurrent < quizQuestions.length - 1) {
      setQuizScore(newScore);
      setQuizCurrent(c => c + 1);
      setQuizSelected(null);
    } else {
      setQuizScore(newScore);
      setQuizState('done');
      setQuizSelected(null);
      submitResults(quizTopic, quizFileId, newScore, quizQuestions.length);
    }
  }, [quizSelected, quizQuestions, quizCurrent, quizScore, quizTopic, quizFileId, submitResults]);

  // ── Quiz: close ────────────────────────────────────────────────────────────
  const handleQuizClose = useCallback(() => {
    setQuizState('closed');
    setSubmitState('idle');
    setNewMasteryPct(null);
  }, []);

  // ── Quiz: retry (same document, new questions) ────────────────────────────
  const handleQuizRetry = useCallback((topic: string) => {
    startQuiz(topic, quizFileId);
  }, [quizFileId, startQuiz]);

  if (authLoading || !authUser) {
    return (
      <div dir={he ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col" style={{ background: '#F2F5F1' }}>
        {/* Header */}
        <div className="h-[60px] shrink-0 flex items-center justify-between px-4 border-b border-[#E2EBE5]"
          style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(16px)' }}>
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-28 h-6 rounded-xl" />
          <Skeleton className="w-20 h-8 rounded-full" />
        </div>
        {/* Body — mimics the topic card grid */}
        <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 flex flex-col gap-5">
          <Skeleton className="w-44 h-7 rounded-xl" />
          <Skeleton className="w-full h-24 rounded-2xl" />
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 p-5 rounded-2xl bg-white/50">
              <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
              <div className="flex-1 flex flex-col gap-2.5">
                <Skeleton className="w-36 h-4 rounded-lg" />
                <Skeleton className="w-full h-2.5 rounded-full" />
              </div>
              <Skeleton className="w-24 h-9 rounded-xl shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div dir={he ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col overflow-x-hidden"
      style={{ background: 'linear-gradient(160deg, #ecf2e6 0%, #f5f0e8 45%, #edf3e9 100%)' }}>

      {/* Course gate */}
      {!selectedCourse && <NoCourseState />}

      {/* ── Organic leaf watermarks — fixed, behind all content ── */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
        <svg style={{ position:'absolute', top:'-70px', right:'-40px', width:'340px', opacity:.055, transform:'rotate(22deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
        </svg>
        <svg style={{ position:'absolute', bottom:'-50px', left:'-25px', width:'260px', opacity:.042, transform:'rotate(-18deg) scaleX(-1)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
        </svg>
        <svg style={{ position:'absolute', top:'37%', right:'-12px', width:'170px', opacity:.035, transform:'rotate(48deg)' }} viewBox="0 0 100 150" fill="#517B3E" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
        </svg>
        <svg style={{ position:'absolute', top:'18%', left:'-8px', width:'130px', opacity:.030, transform:'rotate(-32deg)' }} viewBox="0 0 100 150" fill="#517B3E" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
        </svg>
        <svg style={{ position:'absolute', bottom:'22%', right:'-18px', width:'210px', opacity:.040, transform:'rotate(8deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
        </svg>
        <svg style={{ position:'absolute', top:'62%', left:'-14px', width:'150px', opacity:.027, transform:'rotate(-44deg)' }} viewBox="0 0 100 150" fill="#517B3E" aria-hidden="true">
          <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
        </svg>
      </div>

      {/* ── Quiz Modal ── */}
      <MasteryQuizModal
        state={quizState}
        topic={quizTopic}
        questions={quizQuestions}
        current={quizCurrent}
        score={quizScore}
        selected={quizSelected}
        error={quizError}
        he={he}
        onSelect={handleQuizSelect}
        onNext={handleQuizNext}
        onClose={handleQuizClose}
        onRetry={handleQuizRetry}
        submitState={submitState}
        newMasteryPct={newMasteryPct}
      />

      {/* ── Sidebar ── */}
      <MasterySidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isAdmin={isAdmin}
        lang={lang}
        userFirstName={userFirstName}
        userLastName={userLastName}
        userEmail={userEmail}
        userGender={userGender}
        userInitials={userInitials}
        onRequestLogout={() => { setSidebarOpen(false); setShowLogoutModal(true); }}
      />

      {/* ── Logout modal ── */}
      {showLogoutModal && (
        <LogoutConfirmModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      {/* ── Header ── */}
      <header className="shrink-0 relative z-30"
        style={{
          background:           'rgba(255,255,255,0.82)',
          backdropFilter:       'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom:         '1px solid #E2EBE5',
          boxShadow:            headerScrolled ? '0 4px 16px rgba(28,51,41,0.07)' : 'none',
          transition:           'box-shadow 0.3s ease',
        }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label={he ? 'פתח תפריט' : 'Open menu'}
              className="p-2 rounded-lg hover:bg-[#EEF5F0] transition-colors text-[#1C3329]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <LogoMark size={40} />
          </div>

          <div className="flex-1 flex items-center justify-center gap-2">
            <span className="text-lg leading-none">🎯</span>
            <h1 className="text-[#1C3329] font-bold text-base tracking-wide">
              {he ? 'שליטה בחומר' : 'Mastery'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <CoursePill />
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF5F0] hover:bg-[#E8F0EB] border border-[#D3E0D8] rounded-full text-sm text-[#1C3329] font-semibold transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              {he ? 'EN' : 'HE'}
            </button>

            <div ref={profilePopoverRef} className="relative">
              <button
                onClick={() => setProfilePopoverOpen(p => !p)}
                aria-label="Profile menu"
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all select-none"
                style={{
                  backgroundColor: profilePopoverOpen ? '#D1E6D9' : '#EEF5F0',
                  boxShadow: profilePopoverOpen ? '0 0 0 2px #D1E6D9' : 'none',
                  color: '#1C3329',
                }}
              >
                <AvatarContent gender={userGender} initials={userInitials} />
              </button>

              {profilePopoverOpen && (
                <div
                  dir={he ? 'rtl' : 'ltr'}
                  className="absolute top-full mt-2 z-50 w-64 rounded-2xl overflow-hidden"
                  style={{
                    insetInlineEnd: 0,
                    background: 'rgba(255,255,255,0.98)',
                    border: '1px solid rgba(157,192,139,0.3)',
                    boxShadow: '0 16px 48px rgba(20,40,15,0.18)',
                  }}
                >
                  <div className="px-4 py-4" style={{ borderBottom: '1px solid #e8f0e0' }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 select-none"
                        style={{ background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)' }}
                      >
                        <AvatarContent gender={userGender} initials={userInitials} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1a2e14] truncate">{userFirstName} {userLastName}</p>
                        <p className="text-xs text-[#7a9268] truncate">{userEmail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-2 py-2">
                    <button
                      onClick={() => { setProfilePopoverOpen(false); setShowLogoutModal(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors text-[#7a9268] hover:bg-red-50 hover:text-red-500"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                      </svg>
                      {he ? 'יציאה' : 'Logout'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col py-8 px-4 md:px-8 overflow-y-auto relative" style={{ zIndex: 1 }}>
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">

          {/* Hero */}
          <div
            className="rounded-3xl px-8 py-10 text-center flex flex-col items-center gap-4"
            style={{
              background: 'rgba(255,255,255,0.48)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border: '1px solid rgba(255,255,255,0.52)',
              boxShadow: '0 8px 40px rgba(60,90,40,0.10), inset 0 1px 0 rgba(255,255,255,0.7)',
            }}
          >
            {/* Emoji with glow ring */}
            <div className="relative flex items-center justify-center w-20 h-20">
              <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(81,123,62,0.18) 0%, transparent 70%)' }} />
              <span className="text-5xl leading-none select-none relative">🎯</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-[#1a2e14]">
                {he ? '🎯 שליטה בחומר' : '🎯 Mastery'}
              </h2>
              <p className="text-[#4a5e3a] text-sm leading-relaxed max-w-md">
                {he
                  ? 'הבינה המלאכותית סרקה את הביצועים שלך ומיפתה את נקודות התורפה. הנה הנקודות המדויקות שיש לחדד כדי להבטיח את ה-100.'
                  : 'The AI scanned your performance and mapped your weak points. Here are the exact topics to refine to ensure your 100.'}
              </p>
            </div>
          </div>

          {/* Topics section — loading / empty / populated */}
          {topicsLoading ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 p-5 rounded-3xl"
                  style={{ background: 'rgba(255,255,255,0.42)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.52)' }}>
                  <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                  <div className="flex-1 flex flex-col gap-2.5">
                    <Skeleton className="w-40 h-4 rounded-lg" />
                    <Skeleton className="w-full h-2.5 rounded-full" />
                    <Skeleton className="w-24 h-3 rounded-md" />
                  </div>
                  <Skeleton className="w-24 h-10 rounded-2xl shrink-0" />
                </div>
              ))}
            </div>
          ) : topics.length === 0 ? (
            <div
              className="rounded-3xl px-8 py-14 flex flex-col items-center gap-6 text-center"
              style={{
                background: 'rgba(255,255,255,0.48)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.52)',
                boxShadow: '0 8px 40px rgba(60,90,40,0.09), inset 0 1px 0 rgba(255,255,255,0.65)',
              }}
            >
              <div className="relative flex items-center justify-center w-16 h-16">
                <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(81,123,62,0.14) 0%, transparent 70%)' }} />
                <span className="text-4xl leading-none select-none relative">📂</span>
              </div>
              <div className="space-y-3 max-w-sm">
                <p className="font-extrabold text-[#1a2e14] text-lg">
                  {he ? 'שליטה בחומר' : 'Material Mastery'}
                </p>
                <p className="text-sm text-[#5a7248] leading-relaxed">
                  {he
                    ? 'עדיין לא הועלו חומרי לימוד בסביבת העבודה הזו. ברגע שתעלה קבצים או סיכומים ל-RAG, הבינה המלאכותית תמפה כאן את הנושאים ותעזור לך להשיג שליטה בחומר.'
                    : 'No study materials have been uploaded yet. Once you upload files or summaries to the RAG workspace, the AI will map topics here and help you achieve mastery.'}
                </p>
              </div>
              <button
                onClick={() => router.push('/workspace')}
                className="flex items-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-bold text-white"
                style={{
                  background: 'linear-gradient(135deg, #517B3E, #2A3B22)',
                  boxShadow: '0 4px 20px rgba(81,123,62,0.38)',
                  transition: 'box-shadow 0.18s ease, transform 0.12s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 8px 28px rgba(81,123,62,0.55)';
                  e.currentTarget.style.transform = 'scale(1.03)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(81,123,62,0.38)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <span>🌱</span>
                {he ? 'עבור למרחב הלימוד' : 'Go to StudyLab'}
              </button>
            </div>
          ) : (
            <>
              {/* Section header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, #517B3E, #2A3B22)' }} />
                  <h3 className="text-xs font-bold text-[#2A3B22] uppercase tracking-wider">
                    {he ? `נושאים פעילים · ${topics.length}` : `Active Topics · ${topics.length}`}
                  </h3>
                </div>
                <span className="text-[11px] font-medium text-[#7a9268]">
                  {he ? 'מהחומרים שהועלו לסביבת העבודה' : 'From your uploaded materials'}
                </span>
              </div>

              {/* Topic cards */}
              <div className="flex flex-col gap-5">
                {topics.map(card => (
                  <GapCardUI key={card.id} card={card} he={he} onTest={startQuiz} />
                ))}
              </div>

              {/* CTA banner */}
              <div
                className="rounded-2xl px-6 py-5 flex items-center justify-between gap-4"
                style={{
                  background: 'rgba(255,255,255,0.44)',
                  backdropFilter: 'blur(18px)',
                  WebkitBackdropFilter: 'blur(18px)',
                  border: '1px solid rgba(255,255,255,0.46)',
                  boxShadow: '0 4px 20px rgba(60,90,40,0.07)',
                }}
              >
                <div>
                  <p className="text-sm font-semibold text-[#1a2e14]">
                    {he ? 'רוצה לגלות פערים נוספים?' : 'Want to uncover more gaps?'}
                  </p>
                  <p className="text-xs text-[#7a9268] mt-0.5">
                    {he
                      ? 'הפעל את סימולטור המרצה לחשיפת נושאים נוספים'
                      : 'Run the professor simulator to surface additional topics'}
                  </p>
                </div>
                <button
                  onClick={() => router.push('/workspace/professor-simulator')}
                  className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg, #517B3E, #2A3B22)',
                    boxShadow: '0 4px 16px rgba(81,123,62,0.35)',
                    transition: 'box-shadow 0.18s ease, transform 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 6px 22px rgba(81,123,62,0.52)';
                    e.currentTarget.style.transform = 'scale(1.03)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(81,123,62,0.35)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <span>🧠</span>
                  {he ? 'לסימולטור' : 'Go to Simulator'}
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-3 text-center text-xs text-[#9aaf8a] shrink-0 relative"
        style={{ borderTop: '1px solid rgba(157,192,139,0.25)', zIndex: 1 }}>
        U-Note · {he ? 'מופעל על ידי OpenAI ו-Flask' : 'Powered by OpenAI and Flask'}
      </footer>
    </div>
  );
}
