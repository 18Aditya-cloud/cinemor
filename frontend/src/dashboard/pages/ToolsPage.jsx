import { useState } from 'react';
import useDocumentTitle from '../../hooks/useDocumentTitle.js';
import TextField from '../../components/auth/TextField.jsx';
import { createTool, listJobRoles, listTools } from '../api/organizationApi.js';
import useModalForm from '../hooks/useModalForm.js';
import useResource from '../hooks/useResource.js';
import useOpenFromQuery from '../hooks/useOpenFromQuery.js';
import Button from '../ui/Button.jsx';
import { IconExternal, IconPlus, IconWrench } from '../ui/DashIcons.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Modal, { ModalFooter } from '../ui/Modal.jsx';
import Notice from '../ui/Notice.jsx';
import PageHeader from '../ui/PageHeader.jsx';
import RefreshButton from '../ui/RefreshButton.jsx';
import { useToast } from '../ui/Toast.jsx';
import styles from './pages.module.css';
import t from './ToolsPage.module.css';

const isWebAddress = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// "https://www.blender.org/download/" -> "blender.org/download"
const shortUrl = (url) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

// The tools and, for each card, which job roles use it. If the job roles can't be read, the cards still show.
const loadTools = () => Promise.all([listTools(), listJobRoles().catch(() => [])]);

/** Tools: every tool the organization uses, as cards. Tools has its own header: the icon tile beside the title. */
export default function ToolsPage() {
  useDocumentTitle('Tools');
  const toast = useToast();
  const { data, loading, error, reload } = useResource(loadTools, []);
  const [adding, setAdding] = useState(false);
  useOpenFromQuery(() => setAdding(true));
  const [tools, roles] = data ?? [[], []];

  return (
    <div className={styles.page}>
      <PageHeader
        stacked
        icon={IconWrench}
        title="Tools"
        subtitle="Manage the tools and software used by your organization."
        actions={
          <>
            <RefreshButton withText onClick={reload} loading={loading} />
            <Button icon={IconPlus} onClick={() => setAdding(true)}>
              Add Tool
            </Button>
          </>
        }
      />
      {error && <Notice message={error.message} onRetry={reload} />}

      {tools.length === 0 ? (
        <EmptyState
          framed={false}
          icon={IconWrench}
          title="No tools added yet"
          text="Add the tools and software your organization uses for its projects."
          action={
            <Button icon={IconPlus} onClick={() => setAdding(true)}>
              Add Your First Tool
            </Button>
          }
        />
      ) : (
        <>
          <p className={t.count}>
            {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
          </p>
          <ul className={t.grid} aria-label="Tools">
            {tools.map((tool) => (
              <li key={tool.id}>
                <ToolCard tool={tool} roles={roles.filter((r) => (r.tools || []).map(Number).includes(Number(tool.id)))} />
              </li>
            ))}
          </ul>
        </>
      )}

      <ToolModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          toast('Tool added');
          reload();
        }}
      />
    </div>
  );
}

/** One tool: its initial, name, what it is used for, the job roles that may use it, and its website. */
function ToolCard({ tool, roles }) {
  const titleId = `cm-tool-${tool.id}`;
  return (
    <article className={t.card} aria-labelledby={titleId}>
      <header className={t.head}>
        <span className={t.mark} aria-hidden="true">
          {(tool.name.trim()[0] || '?').toUpperCase()}
        </span>
        <span className={t.id}>#{tool.id}</span>
      </header>

      <h2 id={titleId} className={t.name}>
        {tool.name}
      </h2>
      <p className={t.desc} title={tool.description || undefined}>
        {tool.description || <span className={styles.muted}>No description.</span>}
      </p>

      <div className={t.roles}>
        <span className={t.label}>Used by</span>
        {roles.length ? (
          <ul className={t.chips} aria-label={`Job roles that use ${tool.name}`}>
            {roles.map((r) => (
              <li key={r.id} className={t.chip}>
                {r.name}
              </li>
            ))}
          </ul>
        ) : (
          <span className={t.none}>Not given to any job role yet</span>
        )}
      </div>

      <footer className={t.foot}>
        {tool.url ? (
          <a className={t.link} href={tool.url} target="_blank" rel="noreferrer noopener" aria-label={`Open the ${tool.name} website (opens in a new tab)`}>
            <span className={t.linkText}>{shortUrl(tool.url)}</span>
            <IconExternal width={15} height={15} aria-hidden="true" />
          </a>
        ) : (
          <span className={t.none}>No website</span>
        )}
      </footer>
    </article>
  );
}

function ToolModal({ open, onClose, onAdded }) {
  const form = useModalForm(open, { name: '', description: '', url: '' });

  const submit = async (event) => {
    event.preventDefault();
    const { name, description, url } = form.values;
    const errors = {};
    if (!name.trim()) errors.name = 'Enter the tool name.';
    if (!description.trim()) errors.description = 'Describe how this tool is used.';
    if (url.trim() && !isWebAddress(url.trim())) errors.url = 'Enter a full web address, like https://example.com.';
    form.setErrors(errors);
    if (Object.keys(errors).length) return form.focusFirstInvalid();
    form.setBusy(true);
    try {
      await createTool({ name: name.trim(), description: description.trim(), url: url.trim() });
      onAdded();
      onClose();
    } catch (error) {
      form.setFormError(error.message);
      form.setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal open={open} onClose={onClose} divider title="Add Tool" subtitle="Add a tool used by your organization.">
      <form onSubmit={submit} noValidate>
        <TextField id="tool-name" label="Tool Name" requiredMark value={form.values.name} onChange={form.set('name')} error={form.errors.name} disabled={form.busy} />
        <TextField
          id="tool-description"
          label="Description"
          requiredMark
          multiline
          rows={5}
          placeholder="Describe how this tool is used..."
          value={form.values.description}
          onChange={form.set('description')}
          error={form.errors.description}
          disabled={form.busy}
        />
        <TextField id="tool-url" label="Website URL" optionalMark type="url" placeholder="https://example.com" value={form.values.url} onChange={form.set('url')} error={form.errors.url} disabled={form.busy} />
        {form.formError && (
          <p className={styles.formError} role="alert">
            {form.formError}
          </p>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={form.busy}>
            Cancel
          </Button>
          <Button type="submit" icon={IconPlus} loading={form.busy}>
            Add Tool
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
