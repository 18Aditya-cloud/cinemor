import { useMemo, useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import { Link } from '../../router/router.jsx';
import cx from '../../utils/cx.js';
import { listActivity, listClients, listEmployees, listInvitations, listJobRoles, listProjects, listTools } from '../api/organizationApi.js';
import useResource from '../hooks/useResource.js';
//import timeAgo from '../timeAgo.js';
import { useWorkspace } from '../WorkspaceContext.jsx';
import { IconBriefcase, IconBuilding, IconCheck, IconChevronRight, IconPlus, IconProjects, IconUserPlus, IconUsers, IconWrench } from '../ui/DashIcons.jsx';
import ActivityFeed from '../ui/ActivityFeed.jsx';
import Logo3D from '../ui/Logo3D.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import styles from './OverviewHome.module.css';

const HIDE_KEY = 'cm-getting-started-hidden';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const readHidden = () => {
  try {
    return window.localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};

// Everything the Overview shows comes from these lists. Each one is fetched separately, so if one fails (for example the
// person may not see it) only its own numbers are missing and the rest of the page still works.
async function loadOverview() {
  const calls = { projects: listProjects, invitations: listInvitations, employees: listEmployees, clients: listClients, jobRoles: listJobRoles, tools: listTools, activity: listActivity };
  const entries = await Promise.all(
    Object.entries(calls).map(async ([key, load]) => {
      try {
        return [key, { ok: true, data: await load() }];
      } catch (error) {
        return [key, { ok: false, error }];
      }
    }),
  );
  return Object.fromEntries(entries);
}


/**
 * The dashboard home: who you are, four numbers, what to do next while the workspace is being set up, and what
 * happened lately. (The earlier, simpler home is OverviewClassic.jsx; DASHBOARD.overview in data/content.js chooses.)
 */
export default function OverviewHome() {
  useDocumentTitle('Overview');
  const { displayName, roleSentence } = useWorkspace();
  const { data, loading, reload } = useResource(loadOverview, []);
  const [hidden, setHidden] = useState(readHidden);

  const list = (key) => (data?.[key]?.ok ? data[key].data : null);
  const projects = list('projects');
  const invitations = list('invitations');
  const employees = list('employees');
  const clients = list('clients');
  const jobRoles = list('jobRoles');
  const tools = list('tools');
  const activity = data?.activity;
  const first = loading && !data; // the very first load: show placeholders

  const stats = [
    { to: '/organization/projects', icon: IconProjects, label: 'Ongoing projects', value: projects?.filter((p) => p.status !== 'delivered').length, hint: projects ? `${projects.filter((p) => p.status === 'delivered').length} delivered` : '' },
    { to: '/organization/invitations', icon: IconUserPlus, label: 'Invitations', value: invitations?.length, hint: 'Waiting to accept' },
    { to: '/organization/employees', icon: IconUsers, label: 'Employees', value: employees?.length, hint: employees ? plural(employees.filter((e) => e.teamLeader).length, 'Team Leader', 'Team Leaders') : '' },
    { to: '/organization/clients', icon: IconBuilding, label: 'Clients', value: clients?.length, hint: jobRoles && tools ? `${plural(jobRoles.length, 'job role', 'job roles')}, ${plural(tools.length, 'tool', 'tools')}` : '' },
  ];

  // The setup steps. Each says what to do next; a step that needs something first says so and points at that instead.
  const steps = useMemo(() => {
    const has = (l) => (l ? l.length > 0 : false);
    const leaders = employees ? employees.filter((e) => e.teamLeader).length : 0;
    return [
      { id: 'tools', title: 'Add your tools', text: 'List the software your team uses, like Maya or Blender.', done: has(tools), action: { to: '/organization/tools?new=1', label: 'Add a tool' } },
      { id: 'roles', title: 'Create a job role', text: 'Choose what each role can use in Cinemor.', done: has(jobRoles), action: { to: '/organization/job-roles?new=1', label: 'Create a role' } },
      {
        id: 'team',
        title: 'Invite your team',
        text: 'Send an invitation with a job role.',
        done: has(invitations) || has(employees),
        note: has(jobRoles) ? '' : 'Needs a job role first.',
        action: has(jobRoles) ? { to: '/organization/invitations?new=1', label: 'Invite someone' } : { to: '/organization/job-roles?new=1', label: 'Create a role first' },
      },
      { id: 'clients', title: 'Add a client', text: 'The people you make projects for.', done: has(clients), action: { to: '/organization/clients?new=1', label: 'Add a client' } },
      {
        id: 'project',
        title: 'Create your first project',
        text: 'Pick a client and a Team Leader, and start.',
        done: has(projects),
        note: !has(clients) ? 'Needs a client first.' : leaders === 0 ? 'Needs a Team Leader first (set one on the Employees page).' : '',
        action: !has(clients) ? { to: '/organization/clients?new=1', label: 'Add a client first' } : leaders === 0 ? { to: '/organization/employees', label: 'Choose a Team Leader' } : { to: '/organization/projects?new=1', label: 'Create a project' },
      },
    ];
  }, [tools, jobRoles, invitations, employees, clients, projects]);
  const doneCount = steps.filter((s) => s.done).length;
  const nextId = steps.find((s) => !s.done)?.id;
  const complete = doneCount === steps.length;
  const showSteps = !complete && !hidden;

  const hide = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* it stays hidden until the page is closed */
    }
  };
  const showAgain = () => {
    setHidden(false);
    try {
      window.localStorage.removeItem(HIDE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <Logo3D className={styles.heroLogo} />
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Organization Workspace</p>
          <h1 className={styles.title}>
            Welcome back, <span className={styles.name}>{displayName}</span>
          </h1>
          <p className={styles.sub}>You are signed in as {roleSentence}.</p>
        </div>
        <RefreshButton onClick={reload} loading={loading} />
      </section>

      <ul className={styles.stats} aria-label="At a glance">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <li key={stat.to}>
              <Link to={stat.to} className={styles.stat}>
                <span className={styles.statTile} aria-hidden="true">
                  <Icon width={22} height={22} />
                </span>
                <span className={styles.statBody}>
                  <span className={styles.statLabel}>{stat.label}</span>
                  <span className={styles.statValue}>{first ? <span className={styles.skeleton} aria-label="Loading" /> : stat.value ?? '-'}</span>
                  <span className={styles.statHint}>{first ? '' : stat.value === undefined || stat.value === null ? "Couldn't load" : stat.hint}</span>
                </span>
                <IconChevronRight className={styles.statArrow} width={18} height={18} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>

      <div className={styles.columns}>
        {showSteps ? (
          <section className={styles.card} aria-labelledby="cm-start-title">
            <header className={styles.cardHead}>
              <div>
                <h2 id="cm-start-title" className={styles.cardTitle}>
                  Get started
                </h2>
                <p className={styles.cardSub}>Set up your workspace in a few steps.</p>
              </div>
              <button type="button" className={styles.textButton} onClick={hide}>
                Hide
              </button>
            </header>
            <div className={styles.progressRow}>
              <div className={styles.bar} role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-valuetext={`${doneCount} of ${steps.length} steps done`}>
                <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <span className={styles.progressText}>
                {doneCount} of {steps.length} done
              </span>
            </div>
            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.id} className={cx(styles.step, step.done && styles.stepDone, step.id === nextId && styles.stepNext)}>
                  <span className={styles.marker} aria-hidden="true">
                    {step.done ? <IconCheck width={15} height={15} strokeWidth={3} /> : index + 1}
                  </span>
                  <div className={styles.stepBody}>
                    <h3 className={styles.stepTitle}>
                      {step.title}
                      {step.done && <span className="cm-sr-only"> (done)</span>}
                    </h3>
                    <p className={styles.stepText}>{step.text}</p>
                    {!step.done && step.note && <p className={styles.stepNote}>{step.note}</p>}
                  </div>
                  {!step.done && (
                    <Link to={step.action.to} className={cx(styles.cta, step.id === nextId && styles.ctaNext)}>
                      {step.action.label}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ) : (
          <section className={styles.card} aria-labelledby="cm-quick-title">
            <header className={styles.cardHead}>
              <div>
                <h2 id="cm-quick-title" className={styles.cardTitle}>
                  Quick actions
                </h2>
                <p className={styles.cardSub}>{complete ? "Your workspace is set up. Here's where you'll usually start." : 'The things you do most.'}</p>
              </div>
              {!complete && hidden && (
                <button type="button" className={styles.textButton} onClick={showAgain}>
                  Show setup steps
                </button>
              )}
            </header>
            <ul className={styles.quick}>
              {[
                { to: '/organization/projects?new=1', icon: IconProjects, label: 'Create a project' },
                { to: '/organization/clients?new=1', icon: IconBuilding, label: 'Add a client' },
                { to: '/organization/invitations?new=1', icon: IconUserPlus, label: 'Invite an employee' },
                { to: '/organization/job-roles?new=1', icon: IconBriefcase, label: 'Create a job role' },
                { to: '/organization/tools?new=1', icon: IconWrench, label: 'Add a tool' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link to={item.to} className={styles.quickItem}>
                      <span className={styles.quickIcon} aria-hidden="true">
                        <Icon width={18} height={18} />
                      </span>
                      {item.label}
                      <IconPlus className={styles.quickPlus} width={16} height={16} aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={styles.card} aria-labelledby="cm-activity-title">
          <header className={styles.cardHead}>
            <div>
              <h2 id="cm-activity-title" className={styles.cardTitle}>
                Recent activity
              </h2>
              <p className={styles.cardSub}>What happened in your workspace in the last 14 days.</p>
            </div>
            {activity?.ok && activity.data.length > 0 && (
              <Link to="/organization/activity" className={styles.textButton}>
                View all
              </Link>
            )}
          </header>
          {first ? (
            <ul className={styles.feed} aria-label="Loading activity">
              {[0, 1, 2].map((n) => (
                <li key={n} className={styles.feedItem}>
                  <span className={cx(styles.skeleton, styles.skeletonDot)} />
                  <span className={cx(styles.skeleton, styles.skeletonLine)} />
                </li>
              ))}
            </ul>
          ) : !activity?.ok ? (
            <p className={styles.feedEmpty}>Couldn't load the recent activity. Use Refresh to try again.</p>
          ) : activity.data.length === 0 ? (
            <p className={styles.feedEmpty}>Nothing yet. What you and your team do will show up here.</p>
          ) : (
            // the whole 14 days, in a box of its own that scrolls (older activity is deleted after 14 days)
            <div className={styles.feedScroll} tabIndex={0} role="region" aria-label="Recent activity, scrollable">
              <ActivityFeed items={activity.data} compact label="Recent activity" />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}