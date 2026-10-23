import { useEffect, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { useRouter } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import useResource from '../hooks/useResource.js';
import timeAgo from '../timeAgo.js';
import Button from '../ui/Button.jsx';
import { IconCheckCircle, IconClose, IconEye } from '../ui/DashIcons.jsx';
import Notice from '../ui/Notice.jsx';
import Pill from '../ui/Pill.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import pages from '../pages/pages.module.css';
import { itemLabel,listMySubmissions, listReviews } from './employeeApi.js';
import { NotificationBell } from './EmployeeParts.jsx';
import { AnswerModal } from './ReviewModals.jsx';
import { modulePath, SUBMISSION } from './stages.js';
import e from './Employee.module.css';

async function loadAll() {
  const [reviews, sent] = await Promise.all([listReviews(), listMySubmissions()]);
  return { reviews, sent };
}

/**
 * Reviews: what waits for this person's answer (only the stages they review), what they answered, and what they
 * sent. ?open=<id> highlights one review (the link from Up next).
 */
export default function EmployeeReviewsPage() {
  useDocumentTitle('Reviews');
  const { navigate, search } = useRouter();
  const { data, loading, error, reload } = useResource(loadAll, []);
  const [tab, setTab] = useState('waiting');
  const [answer, setAnswer] = useState(null);
  const openId = Number(new URLSearchParams(search).get('open')) || null;

  const waiting = (data?.reviews || []).filter((r) => r.canAct);
  const answered = (data?.reviews || []).filter((r) => !r.canAct);
  const sent = data?.sent || [];
  const list = tab === 'waiting' ? waiting : tab === 'answered' ? answered : sent;

  useEffect(() => {
    if (!openId) return;
    const el = document.getElementById(`review-${openId}`);
    el?.scrollIntoView({ block: 'center' });
  }, [openId, data]);

  const tabs = [
    ['waiting', 'Waiting for you', waiting.length],
    ['answered', 'Answered', 0],
    ['sent', 'Sent by you', 0],
  ];

  return (
    <div className={pages.page}>
      <div className={e.headRow}>
        <div>
          <h1 className={e.greeting}>Reviews</h1>
          <p className={e.lead}>Only the stages you review come to you. Approving one opens the next stages for their teams.</p>
        </div>
        <div className={e.headTools}>
          <NotificationBell />
          <RefreshButton onClick={reload} loading={loading} />
        </div>
      </div>
      {error && <Notice message={error.message} onRetry={reload} />}

      <div className={e.tabs} role="tablist" aria-label="Reviews" style={{ marginBottom: 16 }}>
        {tabs.map(([id, label, count]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={cx(e.tab, tab === id && e.tabOn)} onClick={() => setTab(id)}>
            {label}
            {count > 0 && <span className={e.count}>{count}</span>}
          </button>
        ))}
      </div>

      {!data ? (
        <p className={e.empty}>Loading…</p>
      ) : list.length === 0 ? (
        <p className={cx(e.card, e.empty)}>
          {tab === 'waiting'
            ? 'Nothing is waiting for your review.'
            : tab === 'answered'
              ? 'You have not answered a review yet.'
              : 'You have not sent anything for review yet.'}
        </p>
      ) : (
        <ul className={e.reviews}>
          {list.map((r) => {
            const st = SUBMISSION[r.status];
            return (
              <li key={r.id} id={`review-${r.id}`} className={cx(e.reviewCard, openId === r.id && e.reviewCardOpen)}>
                <div className={e.reviewTop}>
                  <div>
                    <p className={e.reviewName}>
                      {itemLabel(r)} <span className={e.small}>in</span> {r.projectTitle}
                    </p>
                    <p className={e.small} style={{ marginTop: 4 }}>
                      {tab === 'sent' ? `Sent to ${r.reviewer?.name}` : `Sent by ${r.submittedBy?.name}`} {timeAgo(r.at)}
                      {r.reviewedAt && r.status !== 'pending' ? `, answered ${timeAgo(r.reviewedAt)}` : ''}
                    </p>
                  </div>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </div>
                {r.note && <p className={cx(e.quote, e.quoteNote)}>{r.note}</p>}
                {r.comment && (
                  <p className={cx(e.quote, r.status === 'approved' && e.quoteOk)}>
                    {r.comment}
                    <span className={e.quoteBy}>{r.reviewedBy?.name}</span>
                  </p>
                )}
                <div className={e.stageActions}>
                  <Button variant="secondary" icon={IconEye} onClick={() => navigate(modulePath(r.projectId, r.stage, r.storyId))}>
                    Look at it
                  </Button>
                  {r.canAct && (
                    <>
                      <Button icon={IconCheckCircle} onClick={() => setAnswer({ submission: r, mode: 'approve' })}>
                        Approve
                      </Button>
                      <Button variant="danger" icon={IconClose} onClick={() => setAnswer({ submission: r, mode: 'changes' })}>
                        Ask for changes
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AnswerModal open={Boolean(answer)} submission={answer?.submission} mode={answer?.mode} onClose={() => setAnswer(null)} onDone={reload} />
    </div>
  );
}
