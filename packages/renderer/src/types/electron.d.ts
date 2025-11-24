import { CreateNoteInput, Note, AIConfig } from '../../../core/dist/index';

declare global {
  interface Window {
    electronAPI: {
      createNote: (input: CreateNoteInput) => Promise<{success: boolean; data?: Note; error?: string}>;
      getNotes: (limit?: number, offset?: number) => Promise<{success: boolean; data?: Note[]; error?: string}>;
      getTodayNotes: () => Promise<{success: boolean; data?: Note[]; error?: string}>;
      deleteNote: (id: string) => Promise<{success: boolean; data?: boolean; error?: string}>;
      updateNote: (id: string, text: string) => Promise<{success: boolean; data?: boolean; error?: string}>;
      updateNoteTags: (id: string, tags: string[]) => Promise<{success: boolean; data?: boolean; error?: string}>;
      optimizeContent: (rawContent: string) => Promise<{success: boolean; data?: string; error?: string}>;
      generateDailyDigest: () => Promise<{success: boolean; data?: string; error?: string}>;
      setAIConfig: (config: AIConfig) => Promise<{success: boolean; data?: boolean; error?: string}>;
      getAIConfig: () => Promise<{success: boolean; data?: AIConfig | null; error?: string}>;
      hideFloatingWindow: () => Promise<void>;
      showMainWindow: () => Promise<void>;
      getFloatingWindowEnabled: () => Promise<{success: boolean; data?: boolean; error?: string}>;
      setFloatingWindowEnabled: (enabled: boolean) => Promise<{success: boolean; data?: boolean; error?: string}>;
      resizeFloatingWindow: (width: number, height: number) => Promise<void>;
      moveFloatingWindow: (x: number, y: number) => Promise<void>;
    };
  }
}

export {};