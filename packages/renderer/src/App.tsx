import React, { useState, useEffect } from 'react';
import { Settings, FileText, Sparkles, Monitor, MonitorOff, FolderOpen, MessageCircle, RefreshCw, History } from 'lucide-react';
import NotesList from './components/NotesList';
import DailyDigest from './components/DailyDigest';
import HistoryDigest from './components/HistoryDigest';
import SettingsPanel from './components/SettingsPanel';
import ProjectManagement from './components/ProjectManagement';
import AIAssistant from './components/AIAssistant';

type TabType = 'notes' | 'digest' | 'history' | 'projects' | 'assistant' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('notes');
  const [floatingWindowEnabled, setFloatingWindowEnabled] = useState(false);
  const [floatingToggling, setFloatingToggling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // 加载浮窗状态
  useEffect(() => {
    loadFloatingStatus();

    // 监听浮窗状态变化
    const handler = (window as any).electronAPI?.onFloatingWindowStateChanged?.((enabled: boolean) => {
      setFloatingWindowEnabled(enabled);
    });

    // 清理事件监听器
    return () => {
      (window as any).electronAPI?.removeFloatingWindowStateListener?.(handler);
    };
  }, []);

  const loadFloatingStatus = async () => {
    try {
      const result = await (window as any).electronAPI.getFloatingWindowEnabled();
      if (result.success) {
        setFloatingWindowEnabled(result.data !== false);
      }
    } catch (error) {
      console.error('Failed to load floating status:', error);
    }
  };

  const handleFloatingToggle = async () => {
    try {
      setFloatingToggling(true);
      const newStatus = !floatingWindowEnabled;
      const result = await (window as any).electronAPI.setFloatingWindowEnabled(newStatus);

      if (result.success) {
        setFloatingWindowEnabled(newStatus);
      } else {
        console.error('Failed to toggle floating window:', result.error);
      }
    } catch (error) {
      console.error('Failed to toggle floating window:', error);
    } finally {
      setFloatingToggling(false);
    }
  };

  const handleGlobalRefresh = async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);

      // 触发组件重新渲染，这会让所有子组件重新加载数据
      setRefreshKey(prev => prev + 1);

      // 模拟刷新延迟，给用户反馈
      await new Promise(resolve => setTimeout(resolve, 800));

    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const tabs = [
    { id: 'notes' as TabType, name: '我的记录', icon: FileText },
    { id: 'digest' as TabType, name: '今日总结', icon: Sparkles },
    { id: 'history' as TabType, name: '历史总结', icon: History },
    { id: 'projects' as TabType, name: '项目管理', icon: FolderOpen },
    { id: 'assistant' as TabType, name: 'AI助手', icon: MessageCircle },
    { id: 'settings' as TabType, name: '设置', icon: Settings },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'notes':
        return <NotesList key={`notes-${refreshKey}`} />;
      case 'digest':
        return <DailyDigest key={`digest-${refreshKey}`} />;
      case 'history':
        return <HistoryDigest key={`history-${refreshKey}`} refreshKey={refreshKey} />;
      case 'projects':
        return <ProjectManagement key={`projects-${refreshKey}`} />;
      case 'assistant':
        return <AIAssistant key={`assistant-${refreshKey}`} />;
      case 'settings':
        return <SettingsPanel key={`settings-${refreshKey}`} />;
      default:
        return <NotesList key={`notes-${refreshKey}`} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* 侧边栏 */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flowpad</h1>
            <p className="text-sm text-gray-600 mt-1">AI记事本</p>
          </div>
        </div>

        <nav className="flex-1 p-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-4 py-3 mb-2 rounded-lg text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                title={tab.name}
              >
                <Icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{tab.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 text-xs text-gray-500">
          <p>快捷键：⌥N 快速记录 | ⌥M 显示主窗口</p>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {tabs.find(tab => tab.id === activeTab)?.name}
          </h2>

          {/* 全局刷新和浮窗控制 */}
          <div className="flex items-center space-x-3">
            {/* 全局刷新按钮 */}
            <button
              onClick={handleGlobalRefresh}
              disabled={isRefreshing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="刷新所有数据"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? '刷新中...' : '刷新'}</span>
            </button>

            {/* 浮窗状态指示器 */}
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              floatingWindowEnabled
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-gray-100 text-gray-500 border border-gray-200'
            }`}>
              {floatingWindowEnabled ? (
                <Monitor className="w-4 h-4" />
              ) : (
                <MonitorOff className="w-4 h-4" />
              )}
              <span>{floatingWindowEnabled ? '浮窗已启用' : '浮窗已关闭'}</span>
            </div>

            {/* 浮窗切换按钮 */}
            <button
              onClick={handleFloatingToggle}
              disabled={floatingToggling}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                floatingWindowEnabled
                  ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                  : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={floatingWindowEnabled ? '关闭浮窗' : '启用浮窗'}
            >
              {floatingToggling ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                floatingWindowEnabled ? '关闭' : '启用'
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default App;