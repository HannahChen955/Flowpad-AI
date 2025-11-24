import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { History, Calendar, Search, RefreshCw, Trash2, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { SavedDigest } from '../../../core/src/index';

interface HistoryDigestProps {
  refreshKey?: number;
}

const HistoryDigest: React.FC<HistoryDigestProps> = ({ refreshKey }) => {
  const [savedDigests, setSavedDigests] = useState<SavedDigest[]>([]);
  const [selectedDigest, setSelectedDigest] = useState<SavedDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSavedDigests();
  }, [refreshKey]);

  const loadSavedDigests = async () => {
    try {
      setLoading(true);
      const result = await (window as any).electronAPI.getSavedDigests();
      if (result.success && result.data) {
        setSavedDigests(result.data);
        // 如果没有选中的总结，默认选择第一个
        if (!selectedDigest && result.data.length > 0) {
          setSelectedDigest(result.data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load saved digests:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteDigest = async (id: string) => {
    if (!confirm('确定要删除这个总结吗？')) {
      return;
    }

    try {
      setDeleting(id);
      const result = await (window as any).electronAPI.deleteSavedDigest(id);
      if (result.success) {
        setSavedDigests(prev => prev.filter(digest => digest.id !== id));
        // 如果删除的是当前选中的总结，清空选中状态
        if (selectedDigest?.id === id) {
          setSelectedDigest(null);
        }
      } else {
        alert('删除失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to delete digest:', error);
      alert('删除失败，请重试');
    } finally {
      setDeleting(null);
    }
  };

  // 过滤总结
  const filteredDigests = savedDigests.filter(digest => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      digest.date.toLowerCase().includes(searchLower) ||
      digest.summary.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return format(date, 'yyyy年MM月dd日', { locale: zhCN });
    } catch (error) {
      return dateStr;
    }
  };

  const formatSavedTime = (savedAtStr: string) => {
    try {
      const date = new Date(savedAtStr);
      return format(date, 'MM月dd日 HH:mm', { locale: zhCN });
    } catch (error) {
      return '未知时间';
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* 头部信息 */}
      <div className="p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <History className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">历史总结</h3>
            </div>
            <p className="text-gray-600">
              共保存了 <span className="font-medium text-indigo-600">{savedDigests.length}</span> 个总结
            </p>
          </div>

          <button
            onClick={loadSavedDigests}
            disabled={loading}
            className="btn-primary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? '加载中...' : '刷新'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 总结列表 */}
        <div className="w-1/3 border-r border-gray-200 flex flex-col">
          {/* 搜索栏 */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索日期或内容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 总结列表 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center space-x-2 text-gray-500">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin"></div>
                  <span className="text-sm">加载中...</span>
                </div>
              </div>
            ) : filteredDigests.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">
                  {searchQuery ? '没有找到匹配的总结' : '暂无历史总结'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-4">
                {filteredDigests.map((digest) => (
                  <div
                    key={digest.id}
                    className={`bg-white rounded-lg border p-3 cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedDigest?.id === digest.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200'
                    }`}
                    onClick={() => setSelectedDigest(digest)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span className="font-medium text-gray-900">
                          {formatDate(digest.date)}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDigest(digest.id);
                        }}
                        disabled={deleting === digest.id}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                        title="删除总结"
                      >
                        {deleting === digest.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      保存于：{formatSavedTime(digest.saved_at)}
                    </p>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {digest.summary.slice(0, 100)}...
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 总结内容 */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h4 className="font-medium text-gray-900">
              {selectedDigest
                ? `${formatDate(selectedDigest.date)} 的总结`
                : '选择一个总结查看详细内容'
              }
            </h4>
            {selectedDigest && (
              <p className="text-sm text-gray-500 mt-1">
                保存于：{formatSavedTime(selectedDigest.saved_at)}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {selectedDigest ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{selectedDigest.summary}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <History className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">历史总结</p>
                  <p className="text-sm max-w-md">
                    在左侧列表中选择一个历史总结来查看详细内容
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

export default HistoryDigest;