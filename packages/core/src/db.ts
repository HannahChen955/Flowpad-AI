import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Note, Settings, CreateNoteInput, Context, DatabaseConfig, SavedDigest } from './types';

export class FlowpadDB {
  private db: Database.Database;

  constructor(config: DatabaseConfig) {
    try {
      this.db = new Database(config.path);
      this.initialize();
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
  }

  // 检查数据库连接是否可用
  private isConnectionOpen(): boolean {
    try {
      return this.db && !this.db.readonly && this.db.open;
    } catch {
      return false;
    }
  }

  private initialize(): void {
    // 创建notes表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        app_name TEXT,
        window_title TEXT,
        url TEXT,
        project_hint TEXT,
        type_hint TEXT,
        tags TEXT,
        project_tag TEXT,
        status TEXT DEFAULT 'new'
      );
    `);

    // 为现有的notes表添加tags列（如果不存在）
    try {
      this.db.exec(`ALTER TABLE notes ADD COLUMN tags TEXT;`);
    } catch (error) {
      // 列已存在，忽略错误
    }

    // 为现有的notes表添加project_tag列（如果不存在）
    try {
      this.db.exec(`ALTER TABLE notes ADD COLUMN project_tag TEXT;`);
    } catch (error) {
      // 列已存在，忽略错误
    }

    // 为现有的notes表添加status列（如果不存在）
    try {
      this.db.exec(`ALTER TABLE notes ADD COLUMN status TEXT DEFAULT 'new';`);
    } catch (error) {
      // 列已存在，忽略错误
    }

    // 创建settings表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 创建saved_digests表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_digests (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        saved_at TEXT NOT NULL
      );
    `);

    // 创建自定义标签表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS custom_tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at TEXT NOT NULL,
        used_count INTEGER DEFAULT 0
      );
    `);

    // 创建索引以提高查询性能 - 优化版本
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_project_hint ON notes(project_hint);
      CREATE INDEX IF NOT EXISTS idx_notes_type_hint ON notes(type_hint);
      CREATE INDEX IF NOT EXISTS idx_notes_app_name ON notes(app_name);
      CREATE INDEX IF NOT EXISTS idx_notes_date_created ON notes(date(created_at));
      CREATE INDEX IF NOT EXISTS idx_notes_composite ON notes(project_hint, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_saved_digests_date ON saved_digests(date);
      CREATE INDEX IF NOT EXISTS idx_saved_digests_saved_at ON saved_digests(saved_at DESC);
    `);
  }

  // 创建笔记 - 优化版本
  createNote(input: CreateNoteInput): Note {
    const id = uuidv4();
    const created_at = new Date().toISOString();
    const project_hint = undefined; // 不再自动生成项目提示，完全依赖用户标签
    const type_hint = input.type_hint || this.inferTypeHint(input.text);
    const tags = input.tags || [];
    const tagsJson = tags.length > 0 ? JSON.stringify(tags) : null;

    // 使用传入的项目标签，如果没有则为null
    const project_tag = input.project_tag || null;

    const note: Note = {
      id,
      text: input.text,
      created_at,
      app_name: input.context?.app_name,
      window_title: input.context?.window_title,
      url: input.context?.url,
      project_hint,
      type_hint,
      tags,
      project_tag: project_tag || undefined,
      status: 'new',
    };

    const stmt = this.getOrCreateStatement(
      'createNote',
      'INSERT INTO notes (id, text, created_at, app_name, window_title, url, project_hint, type_hint, tags, project_tag, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    stmt.run(
      note.id,
      note.text,
      note.created_at,
      note.app_name,
      note.window_title,
      note.url,
      note.project_hint,
      note.type_hint,
      tagsJson,
      project_tag,
      note.status
    );

    return note;
  }

  // 缓存预编译语句以提高性能
  private preparedStatements: Map<string, Database.Statement> = new Map();

  private getOrCreateStatement(key: string, sql: string): Database.Statement {
    if (!this.preparedStatements.has(key)) {
      this.preparedStatements.set(key, this.db.prepare(sql));
    }
    return this.preparedStatements.get(key)!;
  }

  // 获取所有笔记 - 优化版本
  getNotes(limit?: number, offset?: number): Note[] {
    // 使用预编译语句缓存提高性能
    let rows: any[];
    if (limit && offset) {
      const stmt = this.getOrCreateStatement(
        'getNotes_limit_offset',
        'SELECT * FROM notes ORDER BY created_at DESC LIMIT ? OFFSET ?'
      );
      rows = stmt.all(limit, offset);
    } else if (limit) {
      const stmt = this.getOrCreateStatement(
        'getNotes_limit',
        'SELECT * FROM notes ORDER BY created_at DESC LIMIT ?'
      );
      rows = stmt.all(limit);
    } else {
      const stmt = this.getOrCreateStatement(
        'getNotes_all',
        'SELECT * FROM notes ORDER BY created_at DESC'
      );
      rows = stmt.all();
    }

    return rows.map(row => this.parseNoteRow(row));
  }

  // 解析数据库行为Note对象
  private parseNoteRow(row: any): Note {
    return {
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      project_tag: row.project_tag || undefined,
      status: row.status || 'new'
    };
  }

  // 获取今天的笔记 - 优化版本
  getTodayNotes(): Note[] {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const stmt = this.getOrCreateStatement(
      'getTodayNotes',
      'SELECT * FROM notes WHERE date(created_at) = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(today);
    return rows.map(row => this.parseNoteRow(row));
  }

  // 根据项目获取笔记 - 优化版本
  getNotesByProject(project: string): Note[] {
    const stmt = this.getOrCreateStatement(
      'getNotesByProject',
      'SELECT * FROM notes WHERE project_hint = ? ORDER BY created_at DESC'
    );
    const rows = stmt.all(project);
    return rows.map(row => this.parseNoteRow(row));
  }

  // 删除笔记 - 优化版本
  deleteNote(id: string): boolean {
    const stmt = this.getOrCreateStatement(
      'deleteNote',
      'DELETE FROM notes WHERE id = ?'
    );
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // 更新笔记 - 优化版本
  updateNote(id: string, text: string): boolean {
    const stmt = this.getOrCreateStatement(
      'updateNote',
      'UPDATE notes SET text = ? WHERE id = ?'
    );
    const result = stmt.run(text, id);
    return result.changes > 0;
  }

  // 更新笔记标签
  updateNoteTags(id: string, tags: string[]): boolean {
    const stmt = this.getOrCreateStatement(
      'updateNoteTags',
      'UPDATE notes SET tags = ? WHERE id = ?'
    );
    const tagsJson = JSON.stringify(tags);
    const result = stmt.run(tagsJson, id);
    return result.changes > 0;
  }

  // 更新笔记状态
  updateNoteStatus(id: string, status: string): boolean {
    const stmt = this.getOrCreateStatement(
      'updateNoteStatus',
      'UPDATE notes SET status = ? WHERE id = ?'
    );
    const result = stmt.run(status, id);
    return result.changes > 0;
  }

  // 更新笔记文本和标签
  updateNoteWithTags(id: string, text: string, tags?: string[]): boolean {
    const transaction = this.db.transaction(() => {
      // 更新文本
      const textStmt = this.getOrCreateStatement(
        'updateNoteText',
        'UPDATE notes SET text = ? WHERE id = ?'
      );
      textStmt.run(text, id);

      // 如果提供了标签，也更新标签
      if (tags !== undefined) {
        const tagsStmt = this.getOrCreateStatement(
          'updateNoteTags2',
          'UPDATE notes SET tags = ? WHERE id = ?'
        );
        const tagsJson = JSON.stringify(tags);
        tagsStmt.run(tagsJson, id);
      }
    });

    try {
      transaction();
      return true;
    } catch (error) {
      console.error('Failed to update note:', error);
      return false;
    }
  }

  // 设置配置 - 优化版本，添加连接检查
  setSetting(key: string, value: string): void {
    if (!this.isConnectionOpen()) {
      console.warn('数据库连接未打开，无法设置:', key, '=', value);
      return;
    }

    try {
      const stmt = this.getOrCreateStatement(
        'setSetting',
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
      );
      stmt.run(key, value);
    } catch (error) {
      console.error('设置配置失败:', key, '=', value, error);
    }
  }

  // 获取配置 - 优化版本，添加连接检查
  getSetting(key: string): string | null {
    if (!this.isConnectionOpen()) {
      console.warn('数据库连接未打开，无法获取设置:', key);
      return null;
    }

    try {
      const stmt = this.getOrCreateStatement(
        'getSetting',
        'SELECT value FROM settings WHERE key = ?'
      );
      const result = stmt.get(key) as { value: string } | undefined;
      return result?.value || null;
    } catch (error) {
      console.error('获取设置失败:', key, error);
      return null;
    }
  }

  // 推断项目提示 - 简化版，不自动分类
  private inferProjectHint(_text: string, _context?: Context): string {
    // 默认为通用分类，不再进行自动项目推断
    // 项目分类将完全依赖用户手动添加的标签
    return 'general';
  }

  // 推断笔记类型
  private inferTypeHint(text: string): string {
    const t = text.toLowerCase();

    // TODO关键词
    if (t.startsWith('todo') || t.match(/(明天|later|记得|follow up|跟进|需要|要做)/)) {
      return 'todo';
    }

    // 问题/风险关键词
    if (t.match(/(风险|risk|问题|bug|错误|error|blocker|阻塞)/)) {
      return 'issue';
    }

    // 想法/创意关键词
    if (t.match(/(想法|idea|可以考虑|也许|建议|优化)/)) {
      return 'idea';
    }

    // 情绪/感受关键词
    if (t.match(/(感觉|心情|累|沮丧|开心|压力|焦虑)/)) {
      return 'feeling';
    }

    return 'note';
  }

  // 保存每日总结到历史记录
  saveDigest(date: string, summary: string): SavedDigest {
    const id = uuidv4();
    const saved_at = new Date().toISOString();

    const savedDigest: SavedDigest = {
      id,
      date,
      summary,
      created_at: date, // 使用总结对应的日期作为创建时间
      saved_at
    };

    const stmt = this.getOrCreateStatement(
      'saveDigest',
      'INSERT INTO saved_digests (id, date, summary, created_at, saved_at) VALUES (?, ?, ?, ?, ?)'
    );

    stmt.run(
      savedDigest.id,
      savedDigest.date,
      savedDigest.summary,
      savedDigest.created_at,
      savedDigest.saved_at
    );

    return savedDigest;
  }

  // 获取所有保存的总结
  getSavedDigests(): SavedDigest[] {
    const stmt = this.getOrCreateStatement(
      'getSavedDigests',
      'SELECT * FROM saved_digests ORDER BY date DESC, saved_at DESC'
    );
    const rows = stmt.all();
    return rows as SavedDigest[];
  }

  // 根据日期获取保存的总结
  getSavedDigestByDate(date: string): SavedDigest | null {
    const stmt = this.getOrCreateStatement(
      'getSavedDigestByDate',
      'SELECT * FROM saved_digests WHERE date = ? ORDER BY saved_at DESC LIMIT 1'
    );
    const result = stmt.get(date);
    return result as SavedDigest | null;
  }

  // 删除保存的总结
  deleteSavedDigest(id: string): boolean {
    const stmt = this.getOrCreateStatement(
      'deleteSavedDigest',
      'DELETE FROM saved_digests WHERE id = ?'
    );
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ==================== 自定义标签管理 ====================

  // 创建自定义标签
  createCustomTag(name: string, color?: string): { success: boolean; error?: string } {
    try {
      // 检查标签是否已存在
      if (this.tagExists(name)) {
        return { success: false, error: '标签名称已存在' };
      }

      const stmt = this.getOrCreateStatement(
        'createCustomTag',
        'INSERT INTO custom_tags (id, name, color, created_at) VALUES (?, ?, ?, ?)'
      );
      const id = uuidv4();
      const created_at = new Date().toISOString();
      stmt.run(id, name, color || '#3B82F6', created_at);
      return { success: true };
    } catch (error) {
      console.error('创建自定义标签失败:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('UNIQUE constraint failed')) {
        return { success: false, error: '标签名称已存在' };
      }
      return { success: false, error: '数据库操作失败' };
    }
  }

  // 获取所有自定义标签
  getCustomTags(): Array<{id: string, name: string, color: string, created_at: string, used_count: number}> {
    const stmt = this.getOrCreateStatement(
      'getCustomTags',
      'SELECT * FROM custom_tags ORDER BY used_count DESC, created_at DESC'
    );
    return stmt.all() as Array<{id: string, name: string, color: string, created_at: string, used_count: number}>;
  }

  // 删除自定义标签
  deleteCustomTag(id: string): boolean {
    const stmt = this.getOrCreateStatement(
      'deleteCustomTag',
      'DELETE FROM custom_tags WHERE id = ?'
    );
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // 更新标签使用次数
  incrementTagUsage(tagName: string): void {
    try {
      const stmt = this.getOrCreateStatement(
        'incrementTagUsage',
        'UPDATE custom_tags SET used_count = used_count + 1 WHERE name = ?'
      );
      stmt.run(tagName);
    } catch (error) {
      // 标签不存在时忽略错误
    }
  }

  // 检查标签是否存在
  tagExists(name: string): boolean {
    const stmt = this.getOrCreateStatement(
      'tagExists',
      'SELECT COUNT(*) as count FROM custom_tags WHERE name = ?'
    );
    const result = stmt.get(name) as { count: number };
    return result.count > 0;
  }

  // 清理7天前标记为完成的笔记
  cleanupCompletedNotes(): { success: boolean; deletedCount: number; error?: string } {
    try {
      // 计算7天前的日期
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString();

      // 查找7天前标记为完成的笔记（status为'closed'的笔记）
      const findStmt = this.getOrCreateStatement(
        'findCompletedNotes',
        `SELECT id FROM notes
         WHERE created_at < ?
         AND status = 'closed'`
      );
      const completedNotes = findStmt.all(cutoffDate) as { id: string }[];

      if (completedNotes.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      // 删除这些笔记
      const deleteStmt = this.getOrCreateStatement(
        'deleteCompletedNotes',
        'DELETE FROM notes WHERE id = ?'
      );

      let deletedCount = 0;
      for (const note of completedNotes) {
        const result = deleteStmt.run(note.id);
        if (result.changes > 0) {
          deletedCount++;
        }
      }

      console.log(`清理完成：删除了 ${deletedCount} 条7天前的已完成笔记`);
      return { success: true, deletedCount };

    } catch (error) {
      console.error('清理已完成笔记失败:', error);
      return {
        success: false,
        deletedCount: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // 关闭数据库连接 - 优化版本
  close(): void {
    // 清理预编译语句缓存（better-sqlite3会自动清理语句）
    this.preparedStatements.clear();

    // 关闭数据库连接
    this.db.close();
  }
}