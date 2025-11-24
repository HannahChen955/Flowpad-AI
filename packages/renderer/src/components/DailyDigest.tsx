import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { Sparkles, Calendar, RefreshCw, FileText, Archive } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Note } from '../../../core/src/index';

const DailyDigest: React.FC = () => {
  const [todayNotes, setTodayNotes] = useState<Note[]>([]);
  const [digest, setDigest] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTodayNotes();
  }, []);

  const loadTodayNotes = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getTodayNotes();
      if (result.success && result.data) {
        setTodayNotes(result.data);
      }
    } catch (error) {
      console.error('Failed to load today notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateDigest = async () => {
    if (todayNotes.length === 0) {
      alert('今日暂无记录，无法生成总结');
      return;
    }

    try {
      setGenerating(true);
      const result = await window.electronAPI.generateDailyDigest();
      if (result.success && result.data) {
        setDigest(result.data);
      } else {
        alert('生成总结失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to generate digest:', error);
      alert('生成总结失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const saveDigestToHistory = async () => {
    if (!digest) {
      alert('请先生成总结');
      return;
    }

    try {
      setSaving(true);
      // 使用ISO日期格式 (YYYY-MM-DD) 保存
      const today = new Date();
      const isoDate = format(today, 'yyyy-MM-dd');
      const result = await (window as any).electronAPI.saveDigestToHistory(isoDate, digest);
      if (result.success) {
        alert('总结已保存到历史记录');
      } else {
        alert('保存失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to save digest:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();
  const todayStr = format(today, 'yyyy年MM月dd日', { locale: zhCN });

  return (
    <div className="flex-1 flex flex-col">
      {/* 头部信息 */}
      <div className="p-6 bg-gradient-to-r from-primary-50 to-purple-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Calendar className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">{todayStr}</h3>
            </div>
            <p className="text-gray-600">
              今日共记录 <span className="font-medium text-primary-600">{todayNotes.length}</span> 条内容
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={generateDigest}
              disabled={generating || todayNotes.length === 0}
              className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{generating ? '生成中...' : '生成今日总结'}</span>
            </button>

            {digest && (
              <button
                onClick={saveDigestToHistory}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="保存当前总结到历史记录"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
                <span>{saving ? '保存中...' : '保存到历史'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 今日记录概览 */}
        <div className="w-1/3 border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="font-medium text-gray-900">今日记录概览</h4>
            <button
              onClick={loadTodayNotes}
              disabled={loading}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="刷新记录"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-2 text-gray-500">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin"></div>
                  <span className="text-sm">加载中...</span>
                </div>
              </div>
            ) : todayNotes.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">今日暂无记录</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayNotes.map((note) => (
                  <div key={note.id} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${getTypeColor(note.type_hint)}`}>
                        {getTypeName(note.type_hint)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(note.created_at), 'HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 line-clamp-3">
                      {note.text}
                    </p>
                    {note.app_name && (
                      <p className="text-xs text-gray-500 mt-2">
                        来自：{note.app_name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 总结内容 */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h4 className="font-medium text-gray-900">AI总结</h4>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {digest ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{digest}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">AI总结</p>
                  <p className="text-sm max-w-md">
                    点击"生成今日总结"按钮，AI将帮你整理今天的记录，生成项目概览、待办清单和复盘反思
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 辅助函数
const getTypeColor = (type?: string) => {
  switch (type) {
    case 'todo': return 'bg-blue-100 text-blue-800';
    case 'issue': return 'bg-red-100 text-red-800';
    case 'idea': return 'bg-yellow-100 text-yellow-800';
    case 'feeling': return 'bg-purple-100 text-purple-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getTypeName = (type?: string) => {
  switch (type) {
    case 'todo': return '待办';
    case 'issue': return '问题';
    case 'idea': return '想法';
    case 'feeling': return '感受';
    default: return '笔记';
  }
};

export default DailyDigest;