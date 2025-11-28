import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Trash2, Monitor, Clock, Tag, FileText, Edit3, Save, X, ListChecks, AlertCircle, Lightbulb, Heart, Filter, Plus, Send, FolderOpen, Copy, Sparkles } from 'lucide-react';
import { Note } from '../../../core/src/index';

// 优化的笔记项组件
interface NoteItemProps {
  note: Note;
  isSelected: boolean;
  onSelect: (note: Note) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, newStatus: string) => void;
  getTypeColor: (type?: string) => string;
  getTypeName: (type?: string) => string;
  getStatusInfo: (tags?: string[]) => { status: string; color: string };
}

const NoteItem = React.memo<NoteItemProps>(({ note, isSelected, onSelect, onDelete, onStatusChange, getTypeColor, getTypeName, getStatusInfo }) => {
  const handleClick = useCallback(() => {
    onSelect(note);
  }, [note, onSelect]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止选择事件
    if (confirm('确定要删除这条记录吗？')) {
      onDelete(note.id);
    }
  }, [note.id, onDelete]);

  const handleStatusClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止选择事件
    const statusInfo = getStatusInfo(note.tags);
    const currentStatus = statusInfo.status;

    // 状态循环: 新增 -> 进行中 -> 已完成 -> 新增
    const statusCycle = {
      '新增': 'ongoing',
      '进行中': 'closed',
      '已完成': '新增'
    };

    const nextStatus = statusCycle[currentStatus as keyof typeof statusCycle] || 'ongoing';
    onStatusChange(note.id, nextStatus);
  }, [note.id, note.tags, onStatusChange, getStatusInfo]);

  const formattedTime = useMemo(() => {
    return format(new Date(note.created_at), 'HH:mm', { locale: zhCN });
  }, [note.created_at]);

  return (
    <div
      onClick={handleClick}
      className={`group p-4 mb-3 rounded-lg cursor-pointer transition-colors border ${
        isSelected
          ? 'bg-primary-50 border-primary-200 shadow-sm'
          : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* 顶部区域：类型标签和时间 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTypeColor(note.type_hint)}`}>
            {getTypeName(note.type_hint)}
          </span>
          {/* Status indicator */}
          {note.type_hint === 'todo' && (
            <button
              onClick={handleStatusClick}
              className={`text-xs px-2 py-1 rounded-full border transition-colors hover:opacity-80 font-medium ${getStatusInfo(note.tags).color}`}
              title="点击切换状态"
            >
              {getStatusInfo(note.tags).status}
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2 text-gray-400">
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span className="text-xs font-medium">{formattedTime}</span>
          </div>
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all duration-200 p-1 hover:bg-red-50 rounded"
            title="删除记录"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="mb-3">
        <p className="text-sm text-gray-900 line-clamp-2 leading-relaxed">
          {note.text}
        </p>
      </div>

      {/* 标签区域 */}
      {((note.project_hint) || (note.tags && note.tags.length > 0)) && (
        <div className="flex items-center space-x-2 flex-wrap gap-y-2 mb-3">
          {note.project_hint && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">
              项目: {note.project_hint}
            </span>
          )}
          {note.tags && note.tags.length > 0 && (
            note.tags.map((tag, index) => (
              <span key={index} className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium">
                #{tag}
              </span>
            ))
          )}
        </div>
      )}

      {/* 底部应用信息 */}
      {note.app_name && (
        <div className="flex items-center text-xs text-gray-500 border-t border-gray-100 pt-2 mt-2">
          <Monitor className="w-3 h-3 mr-2 flex-shrink-0" />
          <span className="font-medium">{note.app_name}</span>
          {note.window_title && (
            <>
              <span className="mx-2 text-gray-300">•</span>
              <span className="truncate text-gray-600">{note.window_title}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
});

NoteItem.displayName = 'NoteItem';

const NotesList: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState('');
  const [editingCategory, setEditingCategory] = useState<string>('');
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [editingCustomTag, setEditingCustomTag] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // 快速记录相关状态
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickNoteCategory, setQuickNoteCategory] = useState<string>('');
  const [quickNoteProject, setQuickNoteProject] = useState<string>('');
  const [customProject, setCustomProject] = useState<string>('');
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string>('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDetailOptimizing, setIsDetailOptimizing] = useState(false);

  useEffect(() => {
    loadNotes();

    // 监听新笔记创建事件
    const handler = (window as any).electronAPI?.onNoteCreated?.((newNote: Note) => {
      setNotes(prevNotes => [newNote, ...prevNotes]);
      // 自动选择新创建的笔记
      setSelectedNote(newNote);
    });

    // 清理事件监听器
    return () => {
      (window as any).electronAPI?.removeNoteCreatedListener?.(handler);
    };
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getNotes(100);
      if (result.success && result.data) {
        setNotes(result.data);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteNote = useCallback(async (id: string) => {
    try {
      const result = await window.electronAPI.deleteNote(id);
      if (result.success) {
        setNotes(prevNotes => prevNotes.filter(note => note.id !== id));
        setSelectedNote(prevSelected => prevSelected?.id === id ? null : prevSelected);
      } else {
        alert('删除失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('删除失败，请重试');
    }
  }, []);

  // 使用useMemo缓存类型样式映射
  const typeColorMap = useMemo(() => ({
    'todo': 'bg-blue-100 text-blue-800',
    'issue': 'bg-red-100 text-red-800',
    'idea': 'bg-yellow-100 text-yellow-800',
    'feeling': 'bg-purple-100 text-purple-800',
    'default': 'bg-gray-100 text-gray-800'
  }), []);

  const typeNameMap = useMemo(() => ({
    'todo': '待办',
    'issue': '问题',
    'idea': '想法',
    'feeling': '感受',
    'default': '笔记'
  }), []);

  const getTypeColor = useCallback((type?: string) => {
    return typeColorMap[type as keyof typeof typeColorMap] || typeColorMap.default;
  }, [typeColorMap]);

  const getTypeName = useCallback((type?: string) => {
    return typeNameMap[type as keyof typeof typeNameMap] || typeNameMap.default;
  }, [typeNameMap]);

  // 状态信息获取函数
  const getStatusInfo = useCallback((tags?: string[]) => {
    if (!tags || tags.length === 0) {
      return { status: '新增', color: 'bg-blue-100 text-blue-700 border-blue-300' };
    }

    // 检查状态标签
    if (tags.includes('ongoing')) {
      return { status: '进行中', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' };
    }
    if (tags.includes('closed')) {
      return { status: '已完成', color: 'bg-green-100 text-green-700 border-green-300' };
    }

    // 默认为新增状态
    return { status: '新增', color: 'bg-blue-100 text-blue-700 border-blue-300' };
  }, []);

  // 状态变更处理函数
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    try {
      // 找到当前笔记
      const currentNote = notes.find(note => note.id === id);
      if (!currentNote) return;

      // 构建新的标签数组
      let newTags = [...(currentNote.tags || [])];

      // 移除现有的状态标签
      newTags = newTags.filter(tag => !['ongoing', 'closed'].includes(tag));

      // 添加新的状态标签（如果不是默认的"新增"状态）
      if (newStatus === 'ongoing') {
        newTags.push('ongoing');
      } else if (newStatus === 'closed') {
        newTags.push('closed');
      }

      // 使用新的updateNoteTags API更新标签
      const result = await window.electronAPI.updateNoteTags(id, newTags);

      if (result.success) {
        // 更新本地状态
        const updatedNote = { ...currentNote, tags: newTags };
        setNotes(prevNotes =>
          prevNotes.map(note =>
            note.id === id ? updatedNote : note
          )
        );

        // 如果是当前选中的笔记，也要更新选中状态
        if (selectedNote?.id === id) {
          setSelectedNote(updatedNote);
        }
      } else {
        alert('状态更新失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to update note status:', error);
      alert('状态更新失败，请重试');
    }
  }, [notes, selectedNote]);

  // 简化的智能标签识别函数
  const parseSmartTags = useCallback((text: string) => {
    const tags: string[] = [];

    // 只匹配用户手动输入的 #标签 格式
    const hashtagRegex = /#[\u4e00-\u9fa5a-zA-Z0-9_-]+/g;
    const hashtags = text.match(hashtagRegex);

    if (hashtags) {
      hashtags.forEach(tag => {
        // 移除 # 号并添加到标签列表
        const cleanTag = tag.substring(1);
        if (cleanTag && !tags.includes(cleanTag)) {
          tags.push(cleanTag);
        }
      });
    }

    return tags;
  }, []);

  // AI内容优化处理函数
  const handleOptimizeContent = useCallback(async () => {
    if (!quickNoteText.trim() || isOptimizing) return;

    setIsOptimizing(true);
    try {
      const result = await window.electronAPI.optimizeContent(quickNoteText.trim());
      if (result.success && result.data) {
        setQuickNoteText(result.data);
      } else {
        alert('AI优化失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to optimize content:', error);
      alert('AI优化失败，请重试');
    } finally {
      setIsOptimizing(false);
    }
  }, [quickNoteText, isOptimizing]);

  // AI优化详情内容处理函数
  const handleOptimizeDetailContent = useCallback(async () => {
    if (!selectedNote || !selectedNote.text.trim() || isDetailOptimizing) return;

    setIsDetailOptimizing(true);
    try {
      const result = await window.electronAPI.optimizeContent(selectedNote.text.trim());
      if (result.success && result.data) {
        // 直接更新笔记内容
        const updateResult = await window.electronAPI.updateNote(selectedNote.id, result.data);
        if (updateResult.success) {
          const updatedNote = { ...selectedNote, text: result.data };
          setNotes(prevNotes =>
            prevNotes.map(note =>
              note.id === selectedNote.id ? updatedNote : note
            )
          );
          setSelectedNote(updatedNote);
        } else {
          alert('更新笔记失败：' + updateResult.error);
        }
      } else {
        alert('AI优化失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to optimize detail content:', error);
      alert('AI优化失败，请重试');
    } finally {
      setIsDetailOptimizing(false);
    }
  }, [selectedNote, isDetailOptimizing]);

  const handleSelectNote = useCallback((note: Note) => {
    setSelectedNote(note);
    setIsEditing(false); // 重置编辑状态
  }, []);

  const handleEditNote = useCallback(() => {
    if (!selectedNote) return;
    setIsEditing(true);
    setEditingText(selectedNote.text);
    setEditingCategory(selectedNote.type_hint || '');
    setEditingTags(selectedNote.tags || []);
    setEditingCustomTag('');
  }, [selectedNote]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedNote || !editingText.trim()) return;

    try {
      const result = await window.electronAPI.updateNote(selectedNote.id, editingText.trim());
      if (result.success) {
        // 更新本地状态
        const updatedNote = { ...selectedNote, text: editingText.trim() };
        setNotes(prevNotes =>
          prevNotes.map(note =>
            note.id === selectedNote.id ? updatedNote : note
          )
        );
        setSelectedNote(updatedNote);
        setIsEditing(false);
      } else {
        alert('更新失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to update note:', error);
      alert('更新失败，请重试');
    }
  }, [selectedNote, editingText]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingText('');
  }, []);

  // 复制记录内容到剪贴板
  const handleCopyNote = useCallback(async () => {
    if (!selectedNote) return;

    try {
      await navigator.clipboard.writeText(selectedNote.text);
      setCopyFeedback('已复制到剪贴板');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setCopyFeedback('复制失败');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  }, [selectedNote]);

  // 加载可用的项目标签
  const loadAvailableProjects = useCallback(async () => {
    try {
      const result = await window.electronAPI.getNotes();
      if (result.success && result.data) {
        const projects = new Set<string>();
        result.data.forEach((note: Note) => {
          if (note.project_tag && note.project_tag !== 'general') {
            projects.add(note.project_tag);
          }
          if (note.tags && note.tags.length > 0) {
            note.tags.forEach((tag: string) => projects.add(tag));
          }
        });
        setAvailableProjects(Array.from(projects).sort());
      }
    } catch (error) {
      console.error('Failed to load available projects:', error);
    }
  }, []);

  // 处理快速记录提交
  const handleQuickNoteSubmit = useCallback(async () => {
    if (!quickNoteText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 智能标签识别
      const smartTags = parseSmartTags(quickNoteText);

      // 构建标签数组
      const tags: string[] = [...smartTags];

      // 添加项目标签
      const projectTag = quickNoteProject || customProject.trim();
      if (projectTag) {
        tags.push(projectTag);
      }

      const result = await window.electronAPI.createNote({
        text: quickNoteText.trim(),
        type_hint: quickNoteCategory || undefined,
        tags: tags.length > 0 ? tags : undefined
      });

      if (result.success) {
        // 重置快速记录表单
        setQuickNoteText('');
        setQuickNoteCategory('');
        setQuickNoteProject('');
        setCustomProject('');
        setShowQuickNote(false);

        // 重新加载笔记列表
        loadNotes();
      } else {
        alert('保存失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('保存失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  }, [quickNoteText, quickNoteCategory, quickNoteProject, customProject, isSubmitting, loadNotes]);

  // 展开快速记录时加载项目
  useEffect(() => {
    if (showQuickNote) {
      loadAvailableProjects();
    }
  }, [showQuickNote, loadAvailableProjects]);

  // 分类定义
  const categories = useMemo(() => [
    { id: 'todo', name: '待办', icon: ListChecks, color: 'bg-blue-100 text-blue-700' },
    { id: 'issue', name: '问题', icon: AlertCircle, color: 'bg-red-100 text-red-700' },
    { id: 'idea', name: '想法', icon: Lightbulb, color: 'bg-yellow-100 text-yellow-700' },
    { id: 'feeling', name: '感受', icon: Heart, color: 'bg-purple-100 text-purple-700' },
    { id: 'note', name: '笔记', icon: FileText, color: 'bg-gray-100 text-gray-700' },
  ], []);

  // 获取所有唯一标签
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    notes.forEach(note => {
      note.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [notes]);

  // 过滤笔记
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      // 按分类过滤
      if (selectedCategory && note.type_hint !== selectedCategory) {
        return false;
      }
      // 按标签过滤
      if (selectedTag && (!note.tags || !note.tags.includes(selectedTag))) {
        return false;
      }
      return true;
    });
  }, [notes, selectedCategory, selectedTag]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center space-x-2 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin"></div>
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex p-4">
      <div className="w-full flex flex-col lg:flex-row">
      {/* 笔记列表 */}
      <div className="w-full lg:w-96 lg:border-r border-gray-200 flex flex-col lg:max-h-screen lg:mr-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">最近记录</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowQuickNote(!showQuickNote)}
                className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 transition-colors text-sm px-2 py-1 hover:bg-blue-50 rounded"
                title="快速记录"
              >
                <Plus className="w-4 h-4" />
                <span>新建</span>
              </button>
              <span className="text-sm text-gray-500">{filteredNotes.length} 条记录</span>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                title="过滤器"
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 快速记录界面 */}
          {showQuickNote && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="space-y-3">
                {/* 文本输入 */}
                <textarea
                  value={quickNoteText}
                  onChange={(e) => setQuickNoteText(e.target.value)}
                  placeholder="快速记录..."
                  className="w-full h-24 resize-none border border-gray-200 rounded p-2 text-sm outline-none placeholder-gray-400 focus:border-blue-400"
                  autoFocus
                />

                {/* AI优化按钮 */}
                {quickNoteText.trim() && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleOptimizeContent}
                      disabled={isOptimizing}
                      className="flex items-center space-x-1 text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors disabled:opacity-50"
                      title="AI智能优化内容格式"
                    >
                      {isOptimizing ? (
                        <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>{isOptimizing ? '优化中...' : 'AI优化'}</span>
                    </button>
                  </div>
                )}

                {/* 智能标签预览 */}
                {quickNoteText.trim() && (() => {
                  const detectedTags = parseSmartTags(quickNoteText);
                  return detectedTags.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                      <span className="text-blue-700 font-medium">智能识别到的标签：</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {detectedTags.map((tag, index) => (
                          <span key={index} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* 分类选择 */}
                <div>
                  <div className="text-xs text-gray-600 mb-1">分类：</div>
                  <div className="flex flex-wrap gap-1">
                    {categories.map((category) => {
                      const IconComponent = category.icon;
                      return (
                        <button
                          key={category.id}
                          onClick={() => setQuickNoteCategory(
                            quickNoteCategory === category.id ? '' : category.id
                          )}
                          className={`text-xs px-2 py-1 rounded-full transition-colors flex items-center space-x-1 ${
                            quickNoteCategory === category.id
                              ? category.color
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <IconComponent className="w-2.5 h-2.5" />
                          <span>{category.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 项目标签选择 */}
                <div>
                  <div className="text-xs text-gray-600 mb-1">项目标签：</div>
                  <div className="space-y-2">
                    {/* 已有项目快速选择 */}
                    {availableProjects.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {availableProjects.slice(0, 3).map((project) => (
                          <button
                            key={project}
                            onClick={() => {
                              setQuickNoteProject(quickNoteProject === project ? '' : project);
                              setCustomProject('');
                            }}
                            className={`text-xs px-2 py-1 rounded-full transition-colors flex items-center space-x-1 ${
                              quickNoteProject === project
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            <FolderOpen className="w-2.5 h-2.5" />
                            <span>{project}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 自定义项目输入 */}
                    <input
                      type="text"
                      value={customProject}
                      onChange={(e) => {
                        setCustomProject(e.target.value);
                        if (e.target.value) {
                          setQuickNoteProject('');
                        }
                      }}
                      placeholder="新建项目标签..."
                      className="w-full text-xs px-2 py-1 border border-gray-200 rounded outline-none placeholder-gray-400 focus:border-blue-400"
                    />
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => {
                      setShowQuickNote(false);
                      setQuickNoteText('');
                      setQuickNoteCategory('');
                      setQuickNoteProject('');
                      setCustomProject('');
                    }}
                    className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleQuickNoteSubmit}
                    disabled={!quickNoteText.trim() || isSubmitting}
                    className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded flex items-center space-x-1 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    <span>{isSubmitting ? '保存中' : '保存'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 过滤器 */}
          {showFilters && (
            <div className="space-y-3">
              {/* 分类过滤 */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">分类</label>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setSelectedCategory('')}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${
                      selectedCategory === ''
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    全部
                  </button>
                  {categories.map((category) => {
                    const IconComponent = category.icon;
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(
                          selectedCategory === category.id ? '' : category.id
                        )}
                        className={`text-xs px-2 py-1 rounded-full transition-colors flex items-center space-x-1 ${
                          selectedCategory === category.id
                            ? category.color
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <IconComponent className="w-3 h-3" />
                        <span>{category.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 标签过滤 */}
              {allTags.length > 0 && (
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">标签</label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setSelectedTag('')}
                      className={`text-xs px-2 py-1 rounded-full transition-colors ${
                        selectedTag === ''
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      全部
                    </button>
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                        className={`text-xs px-2 py-1 rounded-full transition-colors ${
                          selectedTag === tag
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>{notes.length === 0 ? '暂无记录' : '没有匹配的记录'}</p>
              <p className="text-sm mt-2">
                {notes.length === 0
                  ? '按 ⌥N 开始记录你的第一个想法'
                  : '尝试调整过滤条件'
                }
              </p>
            </div>
          ) : (
            <div className="p-2">
              {filteredNotes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  isSelected={selectedNote?.id === note.id}
                  onSelect={handleSelectNote}
                  onDelete={handleDeleteNote}
                  onStatusChange={handleStatusChange}
                  getTypeColor={getTypeColor}
                  getTypeName={getTypeName}
                  getStatusInfo={getStatusInfo}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 详情面板 */}
      <div className="flex-1 flex flex-col lg:max-h-screen min-h-0 lg:max-w-2xl lg:pl-6">
        {selectedNote ? (
          <>
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(selectedNote.type_hint)}`}>
                      {getTypeName(selectedNote.type_hint)}
                    </span>
                    {selectedNote.type_hint === 'todo' && (
                      <button
                        onClick={() => {
                          const statusInfo = getStatusInfo(selectedNote.tags);
                          const currentStatus = statusInfo.status;
                          const statusCycle = {
                            '新增': 'ongoing',
                            '进行中': 'closed',
                            '已完成': '新增'
                          };
                          const nextStatus = statusCycle[currentStatus as keyof typeof statusCycle] || 'ongoing';
                          handleStatusChange(selectedNote.id, nextStatus);
                        }}
                        className={`text-xs px-2 py-1 rounded-full border transition-colors hover:opacity-80 ${getStatusInfo(selectedNote.tags).color}`}
                        title="点击切换状态"
                      >
                        {getStatusInfo(selectedNote.tags).status}
                      </button>
                    )}
                    {selectedNote.project_hint && (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                        {selectedNote.project_hint}
                      </span>
                    )}
                    {selectedNote.tags && selectedNote.tags.length > 0 && (
                      selectedNote.tags.map((tag, index) => (
                        <span key={index} className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                          #{tag}
                        </span>
                      ))
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {format(new Date(selectedNote.created_at), 'yyyy年MM月dd日 HH:mm', { locale: zhCN })}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleEditNote}
                    className="text-blue-500 hover:text-blue-700 transition-colors p-1"
                    title="编辑记录"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(selectedNote.id)}
                    className="text-red-500 hover:text-red-700 transition-colors p-1"
                    title="删除记录"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900">内容</h4>
                  <div className="flex items-center space-x-2">
                    {!isEditing && (
                      <>
                        <button
                          onClick={handleOptimizeDetailContent}
                          disabled={isDetailOptimizing}
                          className="text-gray-500 hover:text-purple-600 transition-colors p-1 disabled:opacity-50"
                          title="AI优化内容"
                        >
                          {isDetailOptimizing ? (
                            <div className="w-4 h-4 border border-purple-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={handleCopyNote}
                          className="text-gray-500 hover:text-blue-600 transition-colors p-1 relative"
                          title="复制内容"
                        >
                          <Copy className="w-4 h-4" />
                          {copyFeedback && (
                            <div className="absolute -top-8 right-0 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                              {copyFeedback}
                            </div>
                          )}
                        </button>
                      </>
                    )}
                    {isEditing && (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editingText.trim()}
                          className="text-green-600 hover:text-green-700 disabled:text-gray-400 transition-colors p-1"
                          title="保存"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                          title="取消"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="输入记录内容..."
                    autoFocus
                  />
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed break-words max-w-prose">
                      {selectedNote.text}
                    </p>
                  </div>
                )}
              </div>

              {/* Tag and Category Editing Section - Only shown in editing mode */}
              {isEditing && (
                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-3">分类和标签</h4>

                  {/* Category Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      分类
                    </label>
                    <select
                      value={editingCategory}
                      onChange={(e) => setEditingCategory(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">选择分类</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tags Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      标签
                    </label>

                    {/* Current Tags */}
                    {editingTags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {editingTags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-700 border border-indigo-200"
                          >
                            #{tag}
                            <button
                              onClick={() => setEditingTags(editingTags.filter((_, i) => i !== index))}
                              className="ml-1 text-indigo-500 hover:text-indigo-700"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add New Tag */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingCustomTag}
                        onChange={(e) => setEditingCustomTag(e.target.value)}
                        placeholder="添加标签..."
                        className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const newTag = editingCustomTag.trim();
                            if (newTag && !editingTags.includes(newTag)) {
                              setEditingTags([...editingTags, newTag]);
                              setEditingCustomTag('');
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const newTag = editingCustomTag.trim();
                          if (newTag && !editingTags.includes(newTag)) {
                            setEditingTags([...editingTags, newTag]);
                            setEditingCustomTag('');
                          }
                        }}
                        className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(selectedNote.app_name || selectedNote.window_title || selectedNote.url) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">上下文信息</h4>
                  <div className="space-y-2 text-sm">
                    {selectedNote.app_name && (
                      <div className="flex items-center">
                        <Monitor className="w-4 h-4 mr-2 text-gray-400" />
                        <span className="text-gray-600">应用：</span>
                        <span className="ml-1 font-medium">{selectedNote.app_name}</span>
                      </div>
                    )}
                    {selectedNote.window_title && (
                      <div className="flex items-start">
                        <Tag className="w-4 h-4 mr-2 text-gray-400 mt-0.5" />
                        <span className="text-gray-600">窗口：</span>
                        <span className="ml-1 font-medium break-words">{selectedNote.window_title}</span>
                      </div>
                    )}
                    {selectedNote.url && (
                      <div className="flex items-start">
                        <Tag className="w-4 h-4 mr-2 text-gray-400 mt-0.5" />
                        <span className="text-gray-600">链接：</span>
                        <a
                          href={selectedNote.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 font-medium text-primary-600 hover:text-primary-700 break-all"
                        >
                          {selectedNote.url}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>选择一条记录查看详情</p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default NotesList;