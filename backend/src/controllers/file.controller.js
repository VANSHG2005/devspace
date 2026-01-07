/**
 * File Controller — Supabase version
 */
import { supabaseAdmin } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/* ── Get single file with content ────────────────────────────────────────── */
export const getFile = async (req, res, next) => {
  try {
    const { data: file, error } = await supabaseAdmin
      .from('files')
      .select('*, created_by_user:users!files_created_by_fkey(name)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .single();

    if (error || !file) return res.status(404).json({ error: 'File not found' });
    res.json({ file });
  } catch (err) { next(err); }
};

/* ── Update file content or name ─────────────────────────────────────────── */
export const updateFile = async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.name    !== undefined) updates.name    = req.body.name;
    updates.updated_at = new Date().toISOString();

    const { data: file, error } = await supabaseAdmin
      .from('files')
      .update(updates)
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error || !file) return res.status(404).json({ error: 'File not found' });
    res.json({ file });
  } catch (err) { next(err); }
};

/* ── Soft-delete file ────────────────────────────────────────────────────── */
export const deleteFile = async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw new Error(error.message);
    res.json({ message: 'File deleted' });
  } catch (err) { next(err); }
};

/* ── Get version history for a file ─────────────────────────────────────── */
export const getVersions = async (req, res, next) => {
  try {
    const { data: versions, error } = await supabaseAdmin
      .from('file_versions')
      .select('*, savedBy:users!file_versions_saved_by_fkey(name)')
      .eq('file_id', req.params.id)
      .order('version_num', { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    res.json({ versions });
  } catch (err) { next(err); }
};

/* ── Save a new named version ────────────────────────────────────────────── */
export const saveVersion = async (req, res, next) => {
  try {
    const { message, content } = req.body;

    // Get current max version number
    const { data: latest } = await supabaseAdmin
      .from('file_versions')
      .select('version_num')
      .eq('file_id', req.params.id)
      .order('version_num', { ascending: false })
      .limit(1)
      .single();

    const versionNum = (latest?.version_num || 0) + 1;

    const { data: version, error } = await supabaseAdmin
      .from('file_versions')
      .insert({
        id: uuidv4(),
        file_id: req.params.id,
        content,
        version_num: versionNum,
        saved_by: req.user.id,
        message,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.status(201).json({ version });
  } catch (err) { next(err); }
};
