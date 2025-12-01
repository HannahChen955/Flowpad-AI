export interface Note {
  id: string;
  text: string;
  created_at: string;
  app_name?: string;
  window_title?: string;
  url?: string;
  project_hint?: string;
  type_hint?: string;
  tags?: string[];
  project_tag?: string;
  status?: string;
}

export interface Settings {
  key: string;
  value: string;
}

export interface Context {
  app_name?: string;
  window_title?: string;
  url?: string;
}

export interface CreateNoteInput {
  text: string;
  context?: Context;
  type_hint?: string;
  tags?: string[];
  project_tag?: string;
}

export interface AIConfig {
  provider: 'openai' | 'qwen';
  api_key: string;
  model?: string;
}

export interface DailyDigest {
  date: string;
  summary: string;
  projects: ProjectSummary[];
  todos: string[];
  reflections: string[];
}

export interface SavedDigest {
  id: string;
  date: string;
  summary: string;
  created_at: string;
  saved_at: string;
}

export interface ProjectSummary {
  name: string;
  progress: string;
  issues: string[];
  ideas: string[];
}

export type NoteType = 'todo' | 'issue' | 'idea' | 'note' | 'feeling';

export interface DatabaseConfig {
  path: string;
}

// AI助手相关类型定义
export interface AssistantResponse {
  message: string;
  actions: AssistantAction[];
}

export interface AssistantAction {
  type: 'create' | 'search' | 'delete' | 'update' | 'analyze';
  params: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: AssistantAction[];
}