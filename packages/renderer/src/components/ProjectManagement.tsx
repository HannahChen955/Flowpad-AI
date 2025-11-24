import React, { useState, useEffect } from 'react';
import { Folder, FileText, Clock, Calendar, ChevronRight, BarChart3, Filter } from 'lucide-react';
import { Note } from '../../../core/src/types';

interface ProjectSummary {
  name: string;
  totalNotes: number;
  todayNotes: number;
  weekNotes: number;
  lastActivity: string;
  noteTypes: {
    todo: number;
    issue: number;
    idea: number;
    note: number;
    feeling: number;
  };
  recentNotes: Note[];
}

const ProjectManagement: React.FC = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'recent'>('all');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getNotes();
      if (result.success && result.data) {
        const projectSummaries = aggregateNotesByProject(result.data);
        setProjects(projectSummaries);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const aggregateNotesByProject = (notes: Note[]): ProjectSummary[] => {
    const projectMap = new Map<string, Note[]>();

    // 按项目标签分组笔记
    notes.forEach(note => {
      // 优先使用project_tag，如果没有则使用tags的第一个，最后使用通用分类
      let projectName = 'general';

      if (note.project_tag) {
        projectName = note.project_tag;
      } else if (note.tags && note.tags.length > 0) {
        projectName = note.tags[0];
      }

      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, []);
      }
      projectMap.get(projectName)!.push(note);
    });

    // 生成项目摘要
    const summaries: ProjectSummary[] = [];
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    projectMap.forEach((projectNotes, projectName) => {
      const sortedNotes = projectNotes.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      const todayNotes = projectNotes.filter(note =>
        note.created_at.split('T')[0] === today
      ).length;

      const weekNotes = projectNotes.filter(note =>
        new Date(note.created_at) > weekAgo
      ).length;

      const noteTypes = {
        todo: projectNotes.filter(note => note.type_hint === 'todo').length,
        issue: projectNotes.filter(note => note.type_hint === 'issue').length,
        idea: projectNotes.filter(note => note.type_hint === 'idea').length,
        note: projectNotes.filter(note => note.type_hint === 'note').length,
        feeling: projectNotes.filter(note => note.type_hint === 'feeling').length,
      };

      summaries.push({
        name: projectName,
        totalNotes: projectNotes.length,
        todayNotes,
        weekNotes,
        lastActivity: sortedNotes[0]?.created_at || '',
        noteTypes,
        recentNotes: sortedNotes.slice(0, 5)
      });
    });

    // 排序并过滤掉general分类（除非它是唯一的分类）
    const sortedSummaries = summaries.sort((a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    // 如果有除general之外的其他项目，则过滤掉general
    const hasOtherProjects = sortedSummaries.some(s => s.name !== 'general');
    if (hasOtherProjects) {
      return sortedSummaries.filter(s => s.name !== 'general');
    }

    return sortedSummaries;
  };

  const getProjectColor = (projectName: string): string => {
    const colors = [
      'bg-blue-100 text-blue-700 border-blue-200',
      'bg-green-100 text-green-700 border-green-200',
      'bg-purple-100 text-purple-700 border-purple-200',
      'bg-orange-100 text-orange-700 border-orange-200',
      'bg-pink-100 text-pink-700 border-pink-200',
      'bg-indigo-100 text-indigo-700 border-indigo-200'
    ];
    const index = projectName.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getTypeColor = (type: string): string => {
    const typeColors: { [key: string]: string } = {
      todo: 'bg-yellow-100 text-yellow-700',
      issue: 'bg-red-100 text-red-700',
      idea: 'bg-blue-100 text-blue-700',
      note: 'bg-gray-100 text-gray-700',
      feeling: 'bg-pink-100 text-pink-700'
    };
    return typeColors[type] || 'bg-gray-100 text-gray-700';
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    return date.toLocaleDateString();
  };

  const filteredProjects = projects.filter(project => {
    switch (filterType) {
      case 'active':
        return project.todayNotes > 0;
      case 'recent':
        return project.weekNotes > 0;
      default:
        return true;
    }
  });

  const selectedProjectData = selectedProject
    ? projects.find(p => p.name === selectedProject)
    : null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">加载项目数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {viewMode === 'overview' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl w-full">
            {/* 头部统计 */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">项目管理</h3>
                  <p className="text-gray-600 mt-1">管理和查看不同项目的笔记记录</p>
                </div>
                <div className="flex items-center space-x-3">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="input-primary text-sm"
                  >
                    <option value="all">所有项目</option>
                    <option value="active">今日活跃</option>
                    <option value="recent">本周活跃</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Folder className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">{filteredProjects.length}</p>
                      <p className="text-sm text-gray-600">活跃项目</p>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {filteredProjects.reduce((sum, p) => sum + p.totalNotes, 0)}
                      </p>
                      <p className="text-sm text-gray-600">总笔记数</p>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {filteredProjects.reduce((sum, p) => sum + p.todayNotes, 0)}
                      </p>
                      <p className="text-sm text-gray-600">今日记录</p>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900">
                        {filteredProjects.reduce((sum, p) => sum + p.weekNotes, 0)}
                      </p>
                      <p className="text-sm text-gray-600">本周记录</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 项目列表 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredProjects.map((project) => (
                <div key={project.name} className="card p-6 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getProjectColor(project.name)}`}>
                        {project.name}
                      </div>
                      <span className="text-sm text-gray-500">
                        {formatDate(project.lastActivity)}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedProject(project.name);
                        setViewMode('detail');
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">总笔记</span>
                      <span className="font-medium">{project.totalNotes}</span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">今日 / 本周</span>
                      <span className="font-medium">{project.todayNotes} / {project.weekNotes}</span>
                    </div>

                    {/* 笔记类型分布 */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {Object.entries(project.noteTypes).map(([type, count]) =>
                        count > 0 && (
                          <span
                            key={type}
                            className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(type)}`}
                          >
                            {type} {count}
                          </span>
                        )
                      )}
                    </div>

                    {/* 最近笔记预览 */}
                    {project.recentNotes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">最近记录</p>
                        <div className="space-y-1">
                          {project.recentNotes.slice(0, 2).map((note) => (
                            <p
                              key={note.id}
                              className="text-sm text-gray-700 truncate"
                            >
                              {note.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredProjects.length === 0 && (
              <div className="text-center py-12">
                <Folder className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">暂无项目数据</h3>
                <p className="text-gray-600">开始记录笔记后，系统会自动按项目进行分类</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 项目详情视图 */
        selectedProjectData && (
          <ProjectDetailView
            project={selectedProjectData}
            onBack={() => {
              setViewMode('overview');
              setSelectedProject(null);
            }}
          />
        )
      )}
    </div>
  );
};

interface ProjectDetailViewProps {
  project: ProjectSummary;
  onBack: () => void;
}

const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({ project, onBack }) => {
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← 返回
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{project.name}</h2>
            <p className="text-sm text-gray-600">
              {project.totalNotes} 条记录 • 最后活动 {new Date(project.lastActivity).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 笔记列表 */}
        <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h3 className="font-medium text-gray-900 mb-4">项目记录</h3>
            <div className="space-y-2">
              {project.recentNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => setSelectedNote(note)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedNote?.id === note.id
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      note.type_hint ?
                      `bg-${note.type_hint === 'todo' ? 'yellow' : note.type_hint === 'issue' ? 'red' : 'blue'}-100 text-${note.type_hint === 'todo' ? 'yellow' : note.type_hint === 'issue' ? 'red' : 'blue'}-700` :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {note.type_hint || 'note'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(note.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{note.text}</p>
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {note.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 笔记详情 */}
        <div className="w-1/2 overflow-y-auto">
          {selectedNote ? (
            <div className="p-6">
              <div className="mb-4">
                <div className="flex items-center space-x-2 mb-2">
                  <span className={`px-2 py-1 rounded text-sm font-medium bg-gray-100 text-gray-700`}>
                    {selectedNote.type_hint || 'note'}
                  </span>
                  <span className="text-sm text-gray-500">
                    {new Date(selectedNote.created_at).toLocaleString()}
                  </span>
                </div>
                {selectedNote.app_name && (
                  <p className="text-sm text-gray-600">应用: {selectedNote.app_name}</p>
                )}
                {selectedNote.window_title && (
                  <p className="text-sm text-gray-600">窗口: {selectedNote.window_title}</p>
                )}
              </div>

              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{selectedNote.text}</p>
              </div>

              {selectedNote.tags && selectedNote.tags.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">标签</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedNote.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">选择一条记录查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectManagement;