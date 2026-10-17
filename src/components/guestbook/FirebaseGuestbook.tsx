'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, Timestamp, doc, deleteDoc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import ResolvedStamp from './ResolvedStamp';
import ResolutionButton from './ResolutionButton';

type GuestbookEntry = {
  id: string;
  name: string;
  message: string;
  timestamp?: Timestamp;
  parentId?: string;
  authorRole?: 'admin' | 'guest';
  likedBy?: string[];
  resolved?: boolean;
};

type GuestbookTheme = 'glass' | 'afterroll';

type FirebaseGuestbookProps = {
  collectionName?: string;
  placeholder?: string;
  emptyMessage?: string;
  theme?: GuestbookTheme;
  canDeleteWhenSignedIn?: boolean;
  threaded?: boolean;
  likesEnabled?: boolean;
  resolutionEnabled?: boolean;
};

const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 50;
const REPLY_INDENT_PER_LEVEL = 1.25;
const MAX_REPLY_INDENT = 5;
const ADMIN_NAME = '✦';
const ADMIN_ROLE = 'admin';
const VISITOR_ID_STORAGE_KEY = 'guestbook-visitor-id';

function isAdminEntry(entry: GuestbookEntry) {
  return entry.authorRole === ADMIN_ROLE;
}

function getLikeCount(entry: GuestbookEntry) {
  return entry.likedBy?.length ?? 0;
}

function getVisitorId() {
  const existingId = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);
  if (existingId) return existingId;

  const visitorId = window.crypto.randomUUID();
  window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);
  return visitorId;
}

const THEME_STYLES = {
  glass: {
    formClassName: 'glass-card rounded-[1.25rem] backdrop-blur-[40px] p-6',
    formStyle: {
      background: 'rgba(0, 0, 0, 0.35)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
    },
    labelClassName: 'block text-[0.85rem] text-[var(--color-muted)] mb-2',
    inputClassName: 'w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-[var(--color-accent)] transition-colors',
    textareaClassName: 'w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-[var(--color-accent)] transition-colors resize-none',
    countClassName: 'text-[0.75rem] text-[var(--color-muted)] mt-2 text-right',
    buttonClassName: 'w-full px-8 py-3.5 rounded-xl bg-[var(--color-accent)]/25 border border-[var(--color-accent)]/50 text-[var(--color-accent)] font-medium hover:bg-[var(--color-accent)]/35 disabled:opacity-50 disabled:cursor-not-allowed transition-all',
    listClassName: 'flex flex-col gap-4 px-4',
    entryClassName: 'glass-card rounded-2xl backdrop-blur-[40px] px-6 py-5',
    entryStyle: {
      background: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    nameClassName: 'font-medium text-[var(--color-text)]',
    adminNameClassName: 'font-medium text-[var(--color-accent)]',
    timeClassName: 'text-[0.75rem] text-white/60',
    messageClassName: 'text-[0.95rem] text-[var(--color-text)]/90 leading-relaxed whitespace-pre-wrap',
    deleteButtonClassName: 'text-[0.75rem] text-white/55 transition-colors hover:text-red-300',
    replyButtonClassName: 'text-[0.75rem] text-[var(--color-muted)] transition-colors hover:text-[var(--color-accent)]',
    reactionButtonClassName: 'text-[0.75rem] text-[var(--color-muted)] transition-colors hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50',
    emptyClassName: 'glass-card rounded-[1rem] p-[3rem] text-center',
    emptyStyle: {
      background: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
    },
    emptyTextClassName: 'text-[var(--color-muted)]',
  },
  afterroll: {
    formClassName: 'rounded-[0.55rem] border border-[var(--atr-line)] bg-white/70 p-[1rem]',
    formStyle: {},
    labelClassName: 'block text-[0.82rem] font-bold text-[var(--atr-soft)] mb-[0.35rem]',
    inputClassName: 'w-full rounded-[0.35rem] border border-[var(--atr-line)] bg-white px-[0.75rem] py-[0.55rem] text-[0.9rem] text-[var(--atr-text)] outline-none placeholder:text-[var(--atr-soft)] focus:border-[var(--atr-line-strong)] transition-colors',
    textareaClassName: 'w-full rounded-[0.35rem] border border-[var(--atr-line)] bg-white px-[0.75rem] py-[0.65rem] text-[0.9rem] leading-[1.6] text-[var(--atr-text)] outline-none placeholder:text-[var(--atr-soft)] focus:border-[var(--atr-line-strong)] transition-colors resize-y',
    countClassName: 'mt-[0.35rem] text-right text-[0.72rem] text-[var(--atr-soft)]',
    buttonClassName: 'w-full rounded-[0.35rem] border border-[var(--atr-line-strong)] bg-[rgba(232,169,186,0.2)] px-[0.9rem] py-[0.55rem] text-[0.86rem] font-bold text-[var(--atr-accent)] transition-colors hover:bg-[rgba(232,169,186,0.3)] disabled:cursor-not-allowed disabled:opacity-50',
    listClassName: 'flex flex-col gap-[0.7rem]',
    entryClassName: 'rounded-[0.45rem] border border-[var(--atr-line)] bg-white/65 px-[1rem] py-[0.85rem]',
    entryStyle: {},
    nameClassName: 'font-bold text-[var(--atr-text)]',
    adminNameClassName: 'font-bold text-[var(--atr-accent)]',
    timeClassName: 'text-[0.72rem] text-[var(--atr-soft)]',
    messageClassName: 'text-[0.92rem] leading-[1.65] text-[var(--atr-muted)] whitespace-pre-wrap',
    deleteButtonClassName: 'text-[0.72rem] text-[var(--atr-soft)] transition-colors hover:text-[var(--atr-warn)]',
    replyButtonClassName: 'text-[0.72rem] text-[var(--atr-soft)] transition-colors hover:text-[var(--atr-accent)]',
    reactionButtonClassName: 'text-[0.72rem] text-[var(--atr-soft)] transition-colors hover:text-[var(--atr-accent)] disabled:cursor-not-allowed disabled:opacity-50',
    emptyClassName: 'rounded-[0.45rem] border border-[var(--atr-line)] bg-white/55 p-[2rem] text-center',
    emptyStyle: {},
    emptyTextClassName: 'text-[var(--atr-muted)]',
  },
} as const;

type ThemeStyles = (typeof THEME_STYLES)[GuestbookTheme];

type ThreadedEntryProps = {
  entry: GuestbookEntry;
  index: number;
  depth: number;
  indent: number;
  replies: GuestbookEntry[];
  isSubmitting: boolean;
  isAdminWriter: boolean;
  likesEnabled: boolean;
  resolutionEnabled: boolean;
  resolvingId: string | null;
  reactingId: string | null;
  visitorId: string | null;
  canDelete: boolean;
  deletingId: string | null;
  styles: ThemeStyles;
  formatDate: (timestamp?: Timestamp) => string;
  onDelete: (entryId: string) => Promise<void>;
  onReplySubmit: (parentId: string, name: string, message: string) => Promise<boolean>;
  onLike: (entry: GuestbookEntry) => Promise<void>;
  onResolve: (entry: GuestbookEntry) => Promise<void>;
  renderReply: (entry: GuestbookEntry, index: number, depth: number) => React.ReactNode;
};

function ThreadedEntry({
  entry,
  index,
  depth,
  indent,
  replies,
  isSubmitting,
  isAdminWriter,
  likesEnabled,
  resolutionEnabled,
  resolvingId,
  reactingId,
  visitorId,
  canDelete,
  deletingId,
  styles,
  formatDate,
  onDelete,
  onReplySubmit,
  onLike,
  onResolve,
  renderReply,
}: ThreadedEntryProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const replyNameId = `reply-name-${entry.id}`;
  const replyMessageId = `reply-message-${entry.id}`;
  const isAdmin = isAdminEntry(entry);

  const handleReply = async (event: React.FormEvent) => {
    event.preventDefault();
    const didSubmit = await onReplySubmit(entry.id, name, message);
    if (didSubmit) {
      setMessage('');
      setIsReplying(false);
    }
  };

  return (
    <div className={depth ? 'border-l border-[var(--atr-line)] pl-[0.75rem]' : undefined} style={depth ? { marginLeft: `${indent}rem` } : undefined}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
        className={styles.entryClassName}
        style={styles.entryStyle}
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-[0.5rem]">
          <p className={isAdmin ? styles.adminNameClassName : styles.nameClassName}>
            {isAdmin ? ADMIN_NAME : entry.name}
          </p>
          <div className="flex items-center gap-[0.6rem]">
            <time className={styles.timeClassName}>{formatDate(entry.timestamp)}</time>
            {canDelete && (
              <button type="button" onClick={() => onDelete(entry.id)} disabled={deletingId === entry.id} className={styles.deleteButtonClassName}>
                {deletingId === entry.id ? '삭제 중...' : '삭제'}
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <p className={`min-w-0 break-words ${styles.messageClassName}`}>{entry.message}</p>
          {resolutionEnabled && <ResolvedStamp resolved={entry.resolved === true} />}
        </div>
        <div className="mt-[0.65rem] flex flex-wrap items-center gap-[0.75rem]">
          <button type="button" onClick={() => setIsReplying((current) => !current)} className={styles.replyButtonClassName} aria-expanded={isReplying}>
            {isReplying ? '답글 취소' : '답글'}
          </button>
          {likesEnabled && <button type="button" onClick={() => void onLike(entry)} disabled={!visitorId || reactingId === entry.id} aria-pressed={visitorId ? entry.likedBy?.includes(visitorId) : false} className={styles.reactionButtonClassName}>{visitorId && entry.likedBy?.includes(visitorId) ? '👍' : '👍🏻'} {getLikeCount(entry)}</button>}
          {resolutionEnabled && isAdminWriter && <ResolutionButton resolved={entry.resolved === true} pending={resolvingId !== null} onToggle={() => void onResolve(entry)} className={styles.reactionButtonClassName} />}
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {isReplying && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleReply}
            className="overflow-hidden"
          >
            <div className="mt-[0.6rem] rounded-[0.45rem] border border-[var(--atr-line)] bg-white/50 p-[0.75rem]">
              {!isAdminWriter && (
                <><label htmlFor={replyNameId} className={styles.labelClassName}>이름 (선택)</label><input id={replyNameId} type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="익명" maxLength={MAX_NAME_LENGTH} className={styles.inputClassName} /></>
              )}
              <label htmlFor={replyMessageId} className={`mt-[0.6rem] ${styles.labelClassName}`}>답글</label>
              <textarea id={replyMessageId} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="답글을 남겨 주세요." maxLength={MAX_MESSAGE_LENGTH} rows={3} className={styles.textareaClassName} />
              <div className="mt-[0.5rem] flex items-center justify-between gap-[0.75rem]">
                <p className={styles.countClassName}>{message.length} / {MAX_MESSAGE_LENGTH}</p>
                <button type="submit" disabled={isSubmitting} className="rounded-[0.35rem] border border-[var(--atr-line-strong)] bg-[rgba(232,169,186,0.2)] px-[0.75rem] py-[0.4rem] text-[0.78rem] font-bold text-[var(--atr-accent)] disabled:cursor-not-allowed disabled:opacity-50">
                  {isSubmitting ? '등록 중...' : '답글 남기기'}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {replies.length > 0 && <div className="mt-[0.7rem] flex flex-col gap-[0.7rem]">{replies.map((reply, replyIndex) => renderReply(reply, replyIndex, depth + 1))}</div>}
    </div>
  );
}

export default function FirebaseGuestbook({
  collectionName = 'guestbook',
  placeholder = '방문해줘서 고마워요',
  emptyMessage = '첫 번째 방문자가 되어주세요',
  theme = 'glass',
  canDeleteWhenSignedIn = false,
  threaded = false,
  likesEnabled = false,
  resolutionEnabled = false,
}: FirebaseGuestbookProps) {
  const { user, isAdmin } = useAuth();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const styles = THEME_STYLES[theme];
  const canDelete = canDeleteWhenSignedIn && !!user;

  const loadEntries = useCallback(async () => {
    try {
      const q = query(
        collection(db, collectionName),
        orderBy('timestamp', threaded ? 'asc' : 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GuestbookEntry[];
      setEntries(data);
    } catch (err) {
      console.error('Failed to load entries:', err);
    }
  }, [collectionName, threaded]);

  // 방명록 불러오기
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (likesEnabled) setVisitorId(getVisitorId());
  }, [likesEnabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      setError('메시지를 입력해주세요');
      return;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      setError(`메시지는 ${MAX_MESSAGE_LENGTH}자 이하로 작성해주세요`);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await addDoc(collection(db, collectionName), {
        name: isAdmin ? ADMIN_NAME : name.trim() || '익명',
        authorRole: isAdmin ? ADMIN_ROLE : 'guest',
        message: message.trim(),
        timestamp: serverTimestamp(),
      });

      // 폼 초기화
      setName('');
      setMessage('');

      // 목록 새로고침
      await loadEntries();
    } catch (err) {
      console.error('Failed to submit:', err);
      setError('메시지 전송에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!canDelete) return;
    if (!window.confirm('이 방명록을 삭제할까요?')) return;

    setDeletingId(entryId);
    setError('');

    try {
      await deleteDoc(doc(db, collectionName, entryId));
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
    } catch (err) {
      console.error('Failed to delete entry:', err);
      setError('방명록 삭제에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleLike = async (entry: GuestbookEntry) => {
    if (!visitorId || reactingId) return;

    setReactingId(entry.id);
    try {
      await runTransaction(db, async (transaction) => {
        const entryRef = doc(db, collectionName, entry.id);
        const snapshot = await transaction.get(entryRef);
        if (!snapshot.exists()) return;

        const likedBy = (snapshot.data().likedBy ?? []) as string[];
        const hasLiked = likedBy.includes(visitorId);
        transaction.update(entryRef, { likedBy: hasLiked ? likedBy.filter((id) => id !== visitorId) : [...likedBy, visitorId] });
      });
      await loadEntries();
    } catch (err) {
      console.error('Failed to update reaction:', err);
      setError('반응을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setReactingId(null);
    }
  };

  const handleResolve = async (entry: GuestbookEntry) => {
    if (!resolutionEnabled || !isAdmin || resolvingId) return;

    setResolvingId(entry.id);
    setError('');
    try {
      const resolved = await runTransaction(db, async (transaction) => {
        const entryRef = doc(db, collectionName, entry.id);
        const snapshot = await transaction.get(entryRef);
        if (!snapshot.exists()) throw new Error('Comment no longer exists');

        const nextResolved = snapshot.data().resolved !== true;
        transaction.update(entryRef, { resolved: nextResolved });
        return nextResolved;
      });
      setEntries((current) => current.map((item) => item.id === entry.id ? { ...item, resolved } : item));
    } catch (err) {
      console.error('Failed to update resolution:', err);
      setError('반영완료 표시를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setResolvingId(null);
    }
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const entriesByParent = useMemo(() => {
    const grouped = new Map<string | null, GuestbookEntry[]>();
    const entryIds = new Set(entries.map((entry) => entry.id));

    entries.forEach((entry) => {
      const parentKey = entry.parentId && entryIds.has(entry.parentId) ? entry.parentId : null;
      const siblings = grouped.get(parentKey) ?? [];
      siblings.push(entry);
      grouped.set(parentKey, siblings);
    });

    return grouped;
  }, [entries]);

  const handleReplySubmit = async (parentId: string, replyName: string, replyMessage: string) => {
    if (!replyMessage.trim()) {
      setError('답글 내용을 입력해주세요');
      return false;
    }

    if (replyMessage.length > MAX_MESSAGE_LENGTH) {
      setError(`답글은 ${MAX_MESSAGE_LENGTH}자 이하로 작성해주세요`);
      return false;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await addDoc(collection(db, collectionName), {
        name: isAdmin ? ADMIN_NAME : replyName.trim() || '익명',
        authorRole: isAdmin ? ADMIN_ROLE : 'guest',
        message: replyMessage.trim(),
        parentId,
        timestamp: serverTimestamp(),
      });
      await loadEntries();
      return true;
    } catch (err) {
      console.error('Failed to submit reply:', err);
      setError('답글 전송에 실패했습니다. 다시 시도해주세요.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderEntry = (entry: GuestbookEntry, index: number, depth = 0): React.ReactNode => {
    const replies = entriesByParent.get(entry.id) ?? [];
    const indent = Math.min(depth * REPLY_INDENT_PER_LEVEL, MAX_REPLY_INDENT);

    return (
      <ThreadedEntry
        key={entry.id}
        entry={entry}
        index={index}
        depth={depth}
        indent={indent}
        replies={replies}
        isSubmitting={isSubmitting}
        isAdminWriter={isAdmin}
        likesEnabled={likesEnabled}
        resolutionEnabled={resolutionEnabled}
        resolvingId={resolvingId}
        reactingId={reactingId}
        visitorId={visitorId}
        canDelete={canDelete}
        deletingId={deletingId}
        styles={styles}
        formatDate={formatDate}
        onDelete={handleDelete}
        onReplySubmit={handleReplySubmit}
        onLike={handleLike}
        onResolve={handleResolve}
        renderReply={renderEntry}
      />
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* 작성 폼 */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        onSubmit={handleSubmit}
        className={styles.formClassName}
        style={styles.formStyle}
      >
        <div className="space-y-5">
          {/* 이름 입력 */}
          {!isAdmin && (
            <div>
              <label htmlFor="name" className={styles.labelClassName}>
                이름 (선택)
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="익명"
                maxLength={MAX_NAME_LENGTH}
                className={styles.inputClassName}
              />
            </div>
          )}

          {/* 메시지 입력 */}
          <div>
            <label htmlFor="message" className={styles.labelClassName}>
              메시지 *
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={placeholder}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={4}
              className={styles.textareaClassName}
            />
            <p className={styles.countClassName}>
              {message.length} / {MAX_MESSAGE_LENGTH}
            </p>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[0.85rem] text-red-400"
            >
              {error}
            </motion.p>
          )}

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={styles.buttonClassName}
          >
            {isSubmitting ? '전송 중...' : '남기기'}
          </button>
        </div>
      </motion.form>

      {/* 방명록 목록 */}
      <div className={styles.listClassName}>
          {!threaded && (
          <AnimatePresence mode="popLayout">
            {entries.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className={styles.entryClassName}
              style={styles.entryStyle}
            >
              {/* 헤더 */}
              <div className="flex flex-wrap items-baseline justify-between gap-[0.5rem] mb-3">
                <p className={isAdminEntry(entry) ? styles.adminNameClassName : styles.nameClassName}>
                  {isAdminEntry(entry) ? ADMIN_NAME : entry.name}
                </p>
                <div className="flex items-center gap-[0.6rem]">
                  <time className={styles.timeClassName}>
                    {formatDate(entry.timestamp)}
                  </time>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      className={styles.deleteButtonClassName}
                    >
                      {deletingId === entry.id ? '삭제 중...' : '삭제'}
                    </button>
                  )}
                </div>
              </div>

              {/* 메시지 */}
              <div className="relative">
                <p className={`min-w-0 break-words ${styles.messageClassName}`}>{entry.message}</p>
                {resolutionEnabled && <ResolvedStamp resolved={entry.resolved === true} />}
              </div>
              {resolutionEnabled && isAdmin && <div className="mt-3"><ResolutionButton resolved={entry.resolved === true} pending={resolvingId !== null} onToggle={() => void handleResolve(entry)} className={styles.reactionButtonClassName} /></div>}
            </motion.div>
            ))}
          </AnimatePresence>
        )}
        {threaded && (entriesByParent.get(null) ?? []).map((entry, index) => renderEntry(entry, index))}

        {/* 빈 상태 */}
        {entries.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={styles.emptyClassName}
            style={styles.emptyStyle}
          >
            <p className={styles.emptyTextClassName}>
              {emptyMessage}
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
