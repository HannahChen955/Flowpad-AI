import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { ChatMessage } from '../../../core/src/types';

interface AIAssistantProps {
  // 可以接受外部传入的笔记数据等
}

const AIAssistant: React.FC<AIAssistantProps> = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是你的AI笔记助手。我可以帮你管理笔记，包括：\n\n• 创建新笔记（待办、问题、想法、感受、普通笔记）\n• 搜索和查找笔记\n• 删除笔记\n• 分类和整理笔记\n• 总结和分析笔记内容\n\n请告诉我你需要什么帮助！',
      timestamp: new Date().toISOString(),
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
    };

    // 添加用户消息
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      // 调用AI助手API
      const response = await (window as any).electronAPI.processAssistantChat(inputText.trim());

      if (response.success) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.data.message,
          timestamp: new Date().toISOString(),
          actions: response.data.actions,
        };

        setMessages(prev => [...prev, assistantMessage]);

        // 如果有操作需要执行，可以在这里处理
        if (response.data.actions && response.data.actions.length > 0) {
          // 处理AI返回的操作指令
          await handleAssistantActions(response.data.actions);
        }
      } else {
        // 错误处理
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `抱歉，处理您的请求时出现了问题：${response.error}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，我现在无法处理您的请求，请稍后再试。',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssistantActions = async (actions: any[]) => {
    // 执行AI助手返回的操作
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'create':
            await (window as any).electronAPI.createNote({
              text: action.params.text,
              type_hint: action.params.type_hint,
              tags: action.params.tags,
            });
            break;
          case 'search':
            // 搜索操作可以显示搜索结果
            break;
          case 'delete':
            // 删除操作
            break;
          case 'update':
            // 更新操作
            break;
          case 'analyze':
            // 分析操作
            break;
        }
      } catch (error) {
        console.error('Failed to execute action:', action, error);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 聊天消息区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex max-w-[80%] ${
                  message.role === 'user'
                    ? 'flex-row-reverse'
                    : 'flex-row'
                }`}
              >
                {/* 头像 */}
                <div className={`flex-shrink-0 ${
                  message.role === 'user'
                    ? 'ml-3'
                    : 'mr-3'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {message.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* 消息内容 */}
                <div className={`${
                  message.role === 'user'
                    ? 'text-right'
                    : 'text-left'
                }`}>
                  <div className={`inline-block p-4 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                  <div className={`text-xs text-gray-500 mt-1 ${
                    message.role === 'user'
                      ? 'text-right'
                      : 'text-left'
                  }`}>
                    {formatTimestamp(message.timestamp)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 加载指示器 */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex flex-row">
                <div className="flex-shrink-0 mr-3">
                  <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                </div>
                <div className="inline-block p-4 rounded-lg bg-white border border-gray-200">
                  <div className="flex items-center space-x-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>思考中...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入你的消息... (Shift + Enter 换行，Enter 发送)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                rows={1}
                style={{
                  minHeight: '48px',
                  maxHeight: '120px',
                  resize: 'none',
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              className="bg-primary-500 text-white p-3 rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="发送消息"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>

          {/* 快捷操作提示 */}
          <div className="mt-3 text-xs text-gray-500">
            <p>你可以说：</p>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className="bg-gray-100 px-2 py-1 rounded">"添加待办：完成项目文档"</span>
              <span className="bg-gray-100 px-2 py-1 rounded">"搜索关于会议的笔记"</span>
              <span className="bg-gray-100 px-2 py-1 rounded">"删除最近的那条笔记"</span>
              <span className="bg-gray-100 px-2 py-1 rounded">"总结今天的工作"</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;