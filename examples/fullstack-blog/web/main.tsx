import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { request, ApiError, type Session, type Post } from './api.js';
import './style.css';

const emptySession: Session = { user: null, csrfToken: null, tenants: [] };
const emptyDraft = { slug: '', title: '', summary: '', body: '' };

function App() {
  const [session, setSession] = useState(emptySession);
  const [tenantId, setTenantId] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [selected, setSelected] = useState<Post | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [publicSlug, setPublicSlug] = useState('');
  const [publicItems, setPublicItems] = useState<Array<Pick<Post, 'id' | 'slug' | 'title' | 'summary'>>>([]);
  const [publicPost, setPublicPost] = useState<Post | null>(null);
  const tenant = session.tenants.find(item => item.id === tenantId);

  useEffect(() => {
    const controller = new AbortController();
    request<Session>('/api/session', { signal: controller.signal }).then(value => {
      setSession(value);
      setTenantId(value.tenants[0]?.id ?? '');
    }).catch(reason => {
      if (!controller.signal.aborted) setError(String(reason));
    }).finally(() => { if (!controller.signal.aborted) setReady(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setPosts([]);
    setSelected(null);
    setDraft(emptyDraft);
    if (!tenantId) return;
    const controller = new AbortController();
    request<{ items: Post[] }>(`/api/tenants/${tenantId}/posts`, { signal: controller.signal })
      .then(value => setPosts(value.items)).catch(reason => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, [tenantId]);

  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await work(); } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 409
        ? `${reason.message}。本地输入已保留，请选择当前文章重新加载后人工合并。`
        : reason instanceof Error ? reason.message : '操作失败');
    } finally { setBusy(false); }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await perform(async () => {
      const value = await request<Session>(`/api/${mode}`, {
        method: 'POST',
        body: {
          email: form.get('email'), password: form.get('password'),
          ...(mode === 'register' ? { tenantSlug: form.get('tenantSlug'), tenantName: form.get('tenantName') } : {}),
        },
      });
      setSession(value);
      setTenantId(value.tenants[0]?.id ?? '');
    });
  }
  async function refreshPosts() {
    setPosts((await request<{ items: Post[] }>(`/api/tenants/${tenantId}/posts`)).items);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform(async () => {
      const base = `/api/tenants/${tenantId}/posts`;
      const value = await request<Post>(selected ? `${base}/${selected.id}` : base, {
        method: selected ? 'PATCH' : 'POST', csrfToken: session.csrfToken,
        body: selected ? { revision: selected.revision, title: draft.title, summary: draft.summary, body: draft.body } : draft,
      });
      setSelected(value);
      setDraft({ slug: value.slug, title: value.title, summary: value.summary, body: value.body });
      await refreshPosts();
    });
  }
  return <main>
    <h1>全栈博客学习项目</h1>
    <p>React → 同源 API → PostgreSQL。正文按纯文本显示，不执行 HTML。</p>
    <p role="alert">{error}</p>
    {!ready ? <p>正在恢复会话…</p> : !session.user ? <section>
      <h2>{mode === 'register' ? '创建学习账号与空间' : '登录'}</h2>
      <form onSubmit={authenticate}>
        <label>邮箱<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
        <label>密码<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={15} maxLength={128} /></label>
        {mode === 'register' ? <>
          <label>空间地址<input name="tenantSlug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} placeholder="learning-blog" /></label>
          <label>空间名称<input name="tenantName" required maxLength={120} /></label>
        </> : null}
        <button disabled={busy}>{busy ? '处理中…' : mode === 'register' ? '注册' : '登录'}</button>
      </form>
      <button disabled={busy} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>切换到{mode === 'login' ? '注册' : '登录'}</button>
    </section> : <section>
      <h2>管理文章</h2>
      <p>当前账号：{session.user.email}</p>
      <button disabled={busy} onClick={() => perform(async () => {
        await request('/api/logout', { method: 'POST', csrfToken: session.csrfToken });
        setSession(emptySession); setTenantId(''); setSelected(null); setDraft(emptyDraft);
      })}>退出登录</button>
      <label>空间<select value={tenantId} disabled={busy} onChange={event => setTenantId(event.target.value)}>
        {session.tenants.map(item => <option key={item.id} value={item.id}>{item.name} ({item.role})</option>)}
      </select></label>
      <ul>{posts.map(post => <li key={post.id}>
        <button disabled={busy} onClick={() => {
          setSelected(post); setDraft({ slug: post.slug, title: post.title, summary: post.summary, body: post.body });
        }}>{post.title} · {post.status} · v{post.revision}</button>
      </li>)}</ul>
      <button disabled={busy} onClick={() => { setSelected(null); setDraft(emptyDraft); }}>新建草稿</button>
      <form onSubmit={save}>
        <label>文章地址<input value={draft.slug} disabled={busy || Boolean(selected)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} onChange={event => setDraft({ ...draft, slug: event.target.value })} /></label>
        <label>标题<input value={draft.title} required maxLength={120} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>摘要<input value={draft.summary} maxLength={240} onChange={event => setDraft({ ...draft, summary: event.target.value })} /></label>
        <label>正文<textarea value={draft.body} required maxLength={100000} rows={10} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
        <button disabled={busy || !tenantId || tenant?.role === 'reader'}>保存{selected ? `版本 ${selected.revision}` : '草稿'}</button>
      </form>
      <button disabled={busy || !selected || selected.status !== 'draft' || tenant?.role === 'reader'} onClick={() => perform(async () => {
        if (!selected) return;
        const value = await request<Post>(`/api/tenants/${tenantId}/posts/${selected.id}/publish`, {
          method: 'POST', csrfToken: session.csrfToken, body: { revision: selected.revision },
        });
        setSelected(value); await refreshPosts();
      })}>发布已保存的草稿</button>
      <p>发布使用服务器已保存内容，修改输入后请先保存。管理列表最多显示 100 篇。</p>
    </section>}
    <section>
      <h2>匿名公开阅读</h2>
      <form onSubmit={event => {
        event.preventDefault();
        void perform(async () => {
          setPublicPost(null);
          const value = await request<{ items: typeof publicItems }>(`/api/public/${encodeURIComponent(publicSlug)}/posts`);
          setPublicItems(value.items);
        });
      }}>
        <label>空间地址<input required value={publicSlug} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={event => setPublicSlug(event.target.value)} /></label>
        <button disabled={busy}>读取已发布文章</button>
      </form>
      <ul>{publicItems.map(post => <li key={post.id}><button disabled={busy} onClick={() => perform(async () => {
        setPublicPost(await request<Post>(`/api/public/${encodeURIComponent(publicSlug)}/posts/${encodeURIComponent(post.slug)}`));
      })}>{post.title}</button><p>{post.summary}</p></li>)}</ul>
      {publicPost ? <article><h3>{publicPost.title}</h3><pre>{publicPost.body}</pre></article> : null}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
