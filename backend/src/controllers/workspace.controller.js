/**
 * Workspace Controller — Supabase version
 */
import { supabaseAdmin } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import { sendInviteEmail } from '../utils/email.js';

/* Generate short readable workspace ID */
const genId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const DEFAULT_FILE = {
  javascript: { name: 'index.js',  content: '// Start coding here\n\nconsole.log("Hello from DevSpace!");\n' },
  typescript: { name: 'index.ts',  content: '// Start coding here\n\nconst greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("DevSpace"));\n' },
  python:     { name: 'main.py',   content: '# Start coding here\n\nprint("Hello from DevSpace!")\n' },
  go:         { name: 'main.go',   content: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from DevSpace!")\n}\n' },
  rust:       { name: 'main.rs',   content: 'fn main() {\n    println!("Hello from DevSpace!");\n}\n' },
};

/* ── Create workspace ─────────────────────────────────────────────────────── */
export const createWorkspace = async (req, res, next) => {
  try {
    const { name, language = 'javascript', description = '' } = req.body;
    const id = genId();

    // Insert workspace
    const { data: ws, error: wsErr } = await supabaseAdmin
      .from('workspaces')
      .insert({ id, name, description, owner_id: req.user.id })
      .select()
      .single();

    if (wsErr) throw new Error(wsErr.message);

    // Add owner as member
    await supabaseAdmin
      .from('workspace_members')
      .insert({ workspace_id: id, user_id: req.user.id, role: 'owner' });

    // Create default file
    const tpl = DEFAULT_FILE[language] || DEFAULT_FILE.javascript;
    await supabaseAdmin.from('files').insert({
      id: uuidv4(),
      workspace_id: id,
      name: tpl.name,
      content: tpl.content,
      language,
      created_by: req.user.id,
    });

    res.status(201).json({ workspace: { ...ws, collaboratorCount: 1, language } });
  } catch (err) { next(err); }
};

/* ── Get all workspaces for logged-in user ───────────────────────────────── */
export const getWorkspaces = async (req, res, next) => {
  try {
    // Get workspace IDs the user belongs to
    const { data: memberships, error: mErr } = await supabaseAdmin
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', req.user.id);

    if (mErr) throw new Error(mErr.message);
    if (!memberships.length) return res.json({ workspaces: [] });

    const ids = memberships.map(m => m.workspace_id);

    const { data: workspaces, error: wErr } = await supabaseAdmin
      .from('workspaces')
      .select(`
        *,
        owner:users!workspaces_owner_id_fkey(name),
        workspace_members(count)
      `)
      .in('id', ids)
      .order('created_at', { ascending: false });

    if (wErr) throw new Error(wErr.message);

    // Attach role info from memberships
    const roleMap = Object.fromEntries(memberships.map(m => [m.workspace_id, m.role]));
    const enriched = workspaces.map(w => ({
      ...w,
      role: roleMap[w.id],
      collaboratorCount: w.workspace_members?.[0]?.count || 1,
      owner_name: w.owner?.name,
    }));

    res.json({ workspaces: enriched });
  } catch (err) { next(err); }
};

/* ── Get single workspace ────────────────────────────────────────────────── */
export const getWorkspace = async (req, res, next) => {
  try {
    const { data: ws, error } = await supabaseAdmin
      .from('workspaces')
      .select(`*, owner:users!workspaces_owner_id_fkey(name), workspace_members(count)`)
      .eq('id', req.params.id)
      .single();

    if (error || !ws) return res.status(404).json({ error: 'Workspace not found' });

    // Check membership
    const { data: membership } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    res.json({
      workspace: {
        ...ws,
        role: membership?.role || null,
        collaboratorCount: ws.workspace_members?.[0]?.count || 1,
        owner_name: ws.owner?.name,
      },
    });
  } catch (err) { next(err); }
};

/* ── Get files in a workspace ────────────────────────────────────────────── */
export const getWorkspaceFiles = async (req, res, next) => {
  try {
    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('id, name, language, content, updated_at, created_at')
      .eq('workspace_id', req.params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    res.json({ files });
  } catch (err) { next(err); }
};

/* ── Create file inside a workspace ──────────────────────────────────────── */
export const createFile = async (req, res, next) => {
  try {
    const { name, content = '' } = req.body;
    const language = name.split('.').pop();
    const { data: file, error } = await supabaseAdmin
      .from('files')
      .insert({ id: uuidv4(), workspace_id: req.params.id, name, content, language, created_by: req.user.id })
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json({ file });
  } catch (err) { next(err); }
};

/* ── Get workspace members ────────────────────────────────────────────────── */
export const getMembers = async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('workspace_members')
      .select('role, joined_at, user:users(id, name, email, color, avatar)')
      .eq('workspace_id', req.params.id)
      .order('joined_at');

    if (error) throw new Error(error.message);
    const members = data.map(m => ({ ...m.user, role: m.role, joined_at: m.joined_at }));
    res.json({ members });
  } catch (err) { next(err); }
};

/* ── Invite member via email ──────────────────────────────────────────────── */
export let _io = null
export const setIo = (io) => { _io = io }

export const inviteMember = async (req, res, next) => {
  try {
    const { email, role = 'editor' } = req.body;

    const { data: ws } = await supabaseAdmin
      .from('workspaces').select('name').eq('id', req.params.id).single();

    // If user exists, add directly
    const { data: invitee } = await supabaseAdmin
      .from('users').select('id, name, email').eq('email', email).single();

    if (invitee) {
      const { data: existing } = await supabaseAdmin
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', req.params.id)
        .eq('user_id', invitee.id)
        .single();

      if (!existing) {
        await supabaseAdmin.from('workspace_members')
          .insert({ workspace_id: req.params.id, user_id: invitee.id, role });
      }
    }

    await sendInviteEmail({
      to: email,
      workspaceName: ws?.name,
      workspaceId: req.params.id,
      inviterName: req.user.name,
    });

    res.json({ message: `Invite sent to ${email}` });
  } catch (err) { next(err); }
};

/* ── Analytics ───────────────────────────────────────────────────────────── */
export const getAnalytics = async (req, res, next) => {
  try {
    const wid = req.params.id;
    const [m, f, msg, e] = await Promise.all([
      supabaseAdmin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', wid),
      supabaseAdmin.from('files').select('*', { count: 'exact', head: true }).eq('workspace_id', wid).is('deleted_at', null),
      supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('workspace_id', wid),
      supabaseAdmin.from('workspace_analytics').select('*', { count: 'exact', head: true }).eq('workspace_id', wid).eq('event_type', 'edit'),
    ]);
    res.json({
      analytics: {
        totalMembers: m.count || 0,
        totalFiles: f.count || 0,
        totalMessages: msg.count || 0,
        totalEdits: e.count || 0,
      },
    });
  } catch (err) { next(err); }
};

/* ── Delete workspace (owner only) ──────────────────────────────────────── */
export const deleteWorkspace = async (req, res, next) => {
  try {
    const { data: ws } = await supabaseAdmin
      .from('workspaces').select('owner_id').eq('id', req.params.id).single();

    if (!ws) return res.status(404).json({ error: 'Not found' });
    if (ws.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete this workspace' });

    await supabaseAdmin.from('workspaces').delete().eq('id', req.params.id);
    res.json({ message: 'Workspace deleted' });
  } catch (err) { next(err); }
};

/* ── Create folder (virtual via filename prefix) ─────────────────────────── */
export const createFolder = async (req, res, next) => {
  try {
    const { name } = req.body
    // Store folder as a special file marker
    const { data: file, error } = await supabaseAdmin.from('files')
      .insert({ id: uuidv4(), workspace_id: req.params.id, name: name + '/.folder', content: '', language: 'folder', created_by: req.user.id })
      .select().single()
    if (error) throw new Error(error.message)
    res.status(201).json({ folder: { id: file.id, name, type: 'folder' } })
  } catch (err) { next(err) }
}

/* ── Rename workspace ─────────────────────────────────────────────────────── */
export const renameWorkspace = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const { data: ws, error } = await supabaseAdmin.from('workspaces')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw new Error(error.message);
    res.json({ workspace: ws });
  } catch (err) { next(err); }
};

/* ── Workspace info (size, file count etc) ───────────────────────────────── */
export const getWorkspaceInfo = async (req, res, next) => {
  try {
    const wid = req.params.id;
    const [wsR, filesR, membersR] = await Promise.all([
      supabaseAdmin.from('workspaces').select('*, owner:users!workspaces_owner_id_fkey(name,email)').eq('id', wid).single(),
      supabaseAdmin.from('files').select('id, name, content, language, created_at, updated_at').eq('workspace_id', wid).is('deleted_at', null),
      supabaseAdmin.from('workspace_members').select('user_id, role, users(name,email)').eq('workspace_id', wid),
    ]);
    const files = filesR.data || [];
    const totalSize = files.reduce((acc, f) => acc + (f.content?.length || 0), 0);
    res.json({
      info: {
        id: wid,
        name: wsR.data?.name,
        language: wsR.data?.language || 'javascript',
        owner: wsR.data?.owner?.name || 'Unknown',
        owner_email: wsR.data?.owner?.email,
        created_at: wsR.data?.created_at,
        updated_at: wsR.data?.updated_at,
        file_count: files.filter(f => !f.name.endsWith('/.folder')).length,
        total_size: totalSize,
        member_count: (membersR.data || []).length,
        members: (membersR.data || []).map(m => ({ name: m.users?.name, role: m.role })),
        languages: [...new Set(files.map(f => f.language).filter(Boolean))],
      }
    });
  } catch (err) { next(err); }
};
// rename + getWorkspaceInfo endpoints added
