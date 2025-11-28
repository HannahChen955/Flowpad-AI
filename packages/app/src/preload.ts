import { contextBridge, ipcRenderer } from 'electron';
import { CreateNoteInput, Note, AIConfig, SavedDigest } from '../../core/dist/index';

// 为渲染进程暴露安全的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 笔记相关API
  createNote: (input: CreateNoteInput) => ipcRenderer.invoke('create-note', input),
  getNotes: (limit?: number, offset?: number) => ipcRenderer.invoke('get-notes', limit, offset),
  getTodayNotes: () => ipcRenderer.invoke('get-today-notes'),
  deleteNote: (id: string) => ipcRenderer.invoke('delete-note', id),
  updateNote: (id: string, text: string) => ipcRenderer.invoke('update-note', id, text),
  updateNoteTags: (id: string, tags: string[]) => ipcRenderer.invoke('update-note-tags', id, tags),

  // AI相关API
  optimizeContent: (rawContent: string) => ipcRenderer.invoke('optimize-content', rawContent),
  generateDailyDigest: () => ipcRenderer.invoke('generate-daily-digest'),
  setAIConfig: (config: AIConfig) => ipcRenderer.invoke('set-ai-config', config),
  getAIConfig: () => ipcRenderer.invoke('get-ai-config'),
  processAssistantChat: (userInput: string) => ipcRenderer.invoke('process-assistant-chat', userInput),

  // 历史总结API
  saveDigestToHistory: (date: string, summary: string) => ipcRenderer.invoke('save-digest-to-history', date, summary),
  getSavedDigests: () => ipcRenderer.invoke('get-saved-digests'),
  getSavedDigestByDate: (date: string) => ipcRenderer.invoke('get-saved-digest-by-date', date),
  deleteSavedDigest: (id: string) => ipcRenderer.invoke('delete-saved-digest', id),

  // 窗口控制API
  hideFloatingWindow: () => ipcRenderer.invoke('hide-floating-window'),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),

  // 浮窗设置API
  getFloatingWindowEnabled: () => ipcRenderer.invoke('get-floating-window-enabled'),
  setFloatingWindowEnabled: (enabled: boolean) => ipcRenderer.invoke('set-floating-window-enabled', enabled),

  // 浮窗窗口控制API
  resizeFloatingWindow: (width: number, height: number) => ipcRenderer.invoke('resize-floating-window', width, height),
  onExpandFloatingWindow: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('expand-floating-window', handler);
    return handler;
  },
  removeExpandFloatingWindowListener: (handler?: any) => {
    if (handler) {
      ipcRenderer.removeListener('expand-floating-window', handler);
    } else {
      ipcRenderer.removeAllListeners('expand-floating-window');
    }
  },

  // 事件监听API
  onFloatingWindowStateChanged: (callback: (enabled: boolean) => void) => {
    const handler = (_: any, enabled: boolean) => callback(enabled);
    ipcRenderer.on('floating-window-state-changed', handler);
    return handler;
  },
  removeFloatingWindowStateListener: (handler?: any) => {
    if (handler) {
      ipcRenderer.removeListener('floating-window-state-changed', handler);
    } else {
      ipcRenderer.removeAllListeners('floating-window-state-changed');
    }
  },
  onNoteCreated: (callback: (note: any) => void) => {
    const handler = (_: any, note: any) => callback(note);
    ipcRenderer.on('note-created', handler);
    return handler;
  },
  removeNoteCreatedListener: (handler?: any) => {
    if (handler) {
      ipcRenderer.removeListener('note-created', handler);
    } else {
      ipcRenderer.removeAllListeners('note-created');
    }
  },
});

// 类型声明，供TypeScript使用
declare global {
  interface Window {
    electronAPI: {
      createNote: (input: CreateNoteInput) => Promise<{success: boolean; data?: Note; error?: string}>;
      getNotes: (limit?: number, offset?: number) => Promise<{success: boolean; data?: Note[]; error?: string}>;
      getTodayNotes: () => Promise<{success: boolean; data?: Note[]; error?: string}>;
      deleteNote: (id: string) => Promise<{success: boolean; data?: boolean; error?: string}>;
      updateNote: (id: string, text: string) => Promise<{success: boolean; data?: boolean; error?: string}>;
      generateDailyDigest: () => Promise<{success: boolean; data?: string; error?: string}>;
      setAIConfig: (config: AIConfig) => Promise<{success: boolean; data?: boolean; error?: string}>;
      getAIConfig: () => Promise<{success: boolean; data?: AIConfig | null; error?: string}>;
      processAssistantChat: (userInput: string) => Promise<{success: boolean; data?: any; error?: string}>;
      saveDigestToHistory: (date: string, summary: string) => Promise<{success: boolean; data?: SavedDigest; error?: string}>;
      getSavedDigests: () => Promise<{success: boolean; data?: SavedDigest[]; error?: string}>;
      getSavedDigestByDate: (date: string) => Promise<{success: boolean; data?: SavedDigest | null; error?: string}>;
      deleteSavedDigest: (id: string) => Promise<{success: boolean; data?: boolean; error?: string}>;
      hideFloatingWindow: () => Promise<void>;
      showMainWindow: () => Promise<void>;
      getFloatingWindowEnabled: () => Promise<{success: boolean; data?: boolean; error?: string}>;
      setFloatingWindowEnabled: (enabled: boolean) => Promise<{success: boolean; data?: boolean; error?: string}>;
      resizeFloatingWindow: (width: number, height: number) => Promise<void>;
      onExpandFloatingWindow: (callback: () => void) => any;
      removeExpandFloatingWindowListener: (handler?: any) => void;
      onFloatingWindowStateChanged: (callback: (enabled: boolean) => void) => any;
      removeFloatingWindowStateListener: (handler?: any) => void;
      onNoteCreated: (callback: (note: any) => void) => any;
      removeNoteCreatedListener: (handler?: any) => void;
    };
  }
}
