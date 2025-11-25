import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { MessageCircle, Send, Minimize2, Trash2 } from 'lucide-react';

interface FloatingButtonProps {
  onPositionChange?: (x: number, y: number) => void;
  initialPosition?: { x: number; y: number };
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

const FloatingButton: React.FC<FloatingButtonProps> = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! 我是您的AI助手，有什么可以帮助您的吗？',
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFocused, setIsFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到最底部，优化以减少重渲染
  useEffect(() => {
    if (!messagesEndRef.current || messages.length === 0) return;

    // 使用 requestAnimationFrame 替代 setTimeout 来优化性能
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const rafId = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(rafId);
  }, [messages.length]); // 只依赖消息数量，而非整个 messages 数组

  // 监听主进程发来的展开事件，快捷键 Option+N 直接进入聊天模式
  useEffect(() => {
    const handler = () => setIsExpanded(true);
    const unsubscribe = (window as any).electronAPI?.onExpandFloatingWindow?.(handler);
    return () => {
      (window as any).electronAPI?.removeExpandFloatingWindowListener?.(unsubscribe);
    };
  }, []);

  // 检测消息类型
  const detectMessageType = (text: string): 'question' | 'task' | 'other' => {
    const lowerText = text.toLowerCase();

    // 任务类关键词 - 优先判断明确的任务行为
    const taskKeywords = [
      '待办', '任务', '计划', '提醒', '安排', '准备要',
      '需要做', '要完成', '记得要', '下次要', '别忘了'
    ];

    if (taskKeywords.some(keyword => text.includes(keyword))) {
      return 'task';
    }

    // 问答类关键词 - 更宽泛的问题识别
    const questionPatterns = [
      /[什么是谁怎么如何为什么哪里哪个哪些]/,
      /是什么|代表什么|意思|定义/,
      /[？?]/, // 包含问号
      /告诉我|请问|想知道|了解/,
      /帮我.*[查找搜索询问解释说明]/,
      /.*公司.*[做是干]/,
      /.*[多少几号时间日期年月]/,
    ];

    // 如果包含问答特征，判定为问题
    if (questionPatterns.some(pattern => pattern.test(text))) {
      return 'question';
    }

    return 'other';
  };

  // 简化的智能标签识别函数
  const parseSmartTags = (text: string) => {
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
  };

  // 清除聊天记录
  const clearChatHistory = () => {
    if (confirm('确定要清除所有聊天记录吗？')) {
      setMessages([{
        id: '1',
        text: 'Hello! 我是您的AI助手，有什么可以帮助您的吗？',
        isUser: false,
        timestamp: new Date()
      }]);
    }
  };

  // 自动创建记录到主应用
  const createNoteFromChat = async (content: string) => {
    try {
      // 智能标签识别
      const smartTags = parseSmartTags(content);

      // 基础标签 + 智能识别标签
      const tags = ['AI-聊天', '浮窗自动创建', ...smartTags];
      let type_hint = undefined;

      // 根据消息类型判断是否为待办任务
      if (detectMessageType(content) === 'task') {
        type_hint = 'todo';
        // 待办默认为新增状态，不需要额外的状态标签
      }

      const result = await (window as any).electronAPI?.createNote({
        text: content,
        type_hint,
        tags
      });

      if (result?.success) {
        console.log('FloatingButton: 自动创建记录成功', result.data);
        return true;
      }
    } catch (error) {
      console.error('FloatingButton: 自动创建记录失败', error);
    }
    return false;
  };

  // 处理问答类请求
  const handleQuestionRequest = async (text: string): Promise<string> => {
    try {
      // 针对日期时间类问题提供直接回答
      if (text.includes('今天') && (text.includes('多少号') || text.includes('几号'))) {
        const today = new Date();
        const dateStr = today.toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long'
        });
        return `今天是${dateStr}`;
      }

      // 使用AI服务回答问题
      const promptForAI = `请直接回答以下问题：${text}

格式要求：
- 使用完整的句子和标点符号
- 按逻辑分段，每段之间空行
- 重要概念可以单独成段
- 保持简洁明了，易于阅读

直接输出答案，不要包含任何前缀说明。`;

      const result = await (window as any).electronAPI?.optimizeContent?.(promptForAI);

      if (result?.success && result?.data) {
        // 清理可能的格式化标记和无用前缀
        let answer = result.data.trim();

        // 移除各种可能的前缀
        answer = answer.replace(/^(回答[:：]?|答[:：]?|解答[:：]?|答案[:：]?)\s*/g, '');
        answer = answer.replace(/^(智能助手.*?指南.*?中文.*?)(?=\w)/g, ''); // 移除指令泄漏
        answer = answer.replace(/^.*?关于.*?的解释\s*/g, ''); // 移除"关于XX的解释"
        answer = answer.replace(/^.*?问题.*?信息.*?沟通\s*/g, ''); // 移除指令残留

        // 清理开头的冗余信息，保留核心回答
        const lines = answer.split('\n').filter((line: string) => line.trim());
        if (lines.length > 0) {
          // 找到第一个真正有意义的内容行
          const meaningfulStartIndex = lines.findIndex((line: string) =>
            !line.includes('指南') &&
            !line.includes('要求') &&
            !line.includes('提供') &&
            line.length > 5
          );
          if (meaningfulStartIndex > 0) {
            answer = lines.slice(meaningfulStartIndex).join('\n');
          }
        }

        return answer.trim();
      }

      return '抱歉，我现在无法回答这个问题。您可以尝试在主应用中查找相关信息。';
    } catch (error) {
      console.error('处理问答请求失败:', error);
      return '处理问题时出现错误，请稍后重试。';
    }
  };

  // 发送消息 - 使用 useCallback 优化性能
  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText.trim(),
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputText.trim();
    setInputText('');
    setIsTyping(true);

    // 发送消息后自动失去焦点，让用户回到原应用
    if (inputRef.current) {
      inputRef.current.blur();
      setIsFocused(false);
    }

    // 检测消息类型并处理
    const messageType = detectMessageType(currentInput);
    let responseText = '';
    let recordCreated = false;

    try {
      if (messageType === 'question') {
        // 问答类请求 - 直接回答
        responseText = await handleQuestionRequest(currentInput);
      } else if (messageType === 'task') {
        // 任务类请求 - 创建记录
        recordCreated = await createNoteFromChat(currentInput);
        if (recordCreated) {
          responseText = '✅ 我已为您创建了这个任务记录，您可以在"我的记录"中查看和管理。';
        } else {
          responseText = '⚠️ 创建任务记录时遇到问题，请您手动在主应用中添加。';
        }
      } else {
        // 其他类型 - 友好回复
        responseText = '收到您的消息！我会尽力帮助您。如果您有具体问题可以直接询问，或者说出需要记录的任务我可以帮您保存。';
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('处理消息失败:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: '抱歉，处理您的消息时出现了错误，请稍后重试。',
        isUser: false,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  }, [inputText]); // useCallback 依赖项

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 拖拽处理
  const handleMouseDown = (e: React.MouseEvent) => {
    // 在展开状态下，只有点击头部区域才能拖拽
    const target = e.target as HTMLElement;
    if (isExpanded && !target.closest('.drag-handle')) {
      return;
    }

    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY
    });
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // 获取当前屏幕位置并计算新位置
      const currentX = window.screenX || 0;
      const currentY = window.screenY || 0;
      let newX = currentX + deltaX;
      let newY = currentY + deltaY;

      // 获取屏幕边界
      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;
      const screenLeft = (window.screen as any).availLeft || 0;
      const screenTop = (window.screen as any).availTop || 0;

      // 获取窗口尺寸
      const windowWidth = isExpanded ? 350 : 60;
      const windowHeight = isExpanded ? 500 : 60;

      // 应用边界约束
      newX = Math.max(screenLeft, Math.min(newX, screenLeft + screenWidth - windowWidth));
      newY = Math.max(screenTop, Math.min(newY, screenTop + screenHeight - windowHeight));

      // 通过Electron API移动窗口到新的绝对位置
      (window as any).electronAPI?.moveFloatingWindow?.(newX, newY);

      // 更新拖拽起始点，为下次移动做准备
      setDragStart({
        x: e.clientX,
        y: e.clientY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // 检查并调整窗口位置以确保在屏幕边界内
  const adjustWindowPosition = (isExpanding: boolean) => {
    const screenWidth = window.screen.availWidth;
    const screenHeight = window.screen.availHeight;
    const screenLeft = (window.screen as any).availLeft || 0;
    const screenTop = (window.screen as any).availTop || 0;

    const currentX = window.screenX || 0;
    const currentY = window.screenY || 0;

    const windowWidth = isExpanding ? 350 : 60;
    const windowHeight = isExpanding ? 500 : 60;

    // 计算调整后的位置
    let newX = currentX;
    let newY = currentY;

    // 如果窗口会超出右边界，向左调整
    if (currentX + windowWidth > screenLeft + screenWidth) {
      newX = screenLeft + screenWidth - windowWidth;
    }

    // 如果窗口会超出下边界，向上调整
    if (currentY + windowHeight > screenTop + screenHeight) {
      newY = screenTop + screenHeight - windowHeight;
    }

    // 确保不会超出左边界和上边界
    newX = Math.max(screenLeft, newX);
    newY = Math.max(screenTop, newY);

    // 如果需要调整位置，先移动窗口再调整大小
    if (newX !== currentX || newY !== currentY) {
      (window as any).electronAPI?.moveFloatingWindow?.(newX, newY);
      // 稍微延迟调整大小，确保位置调整完成
      setTimeout(() => {
        (window as any).electronAPI?.resizeFloatingWindow?.(windowWidth, windowHeight);
      }, 50);
    } else {
      (window as any).electronAPI?.resizeFloatingWindow?.(windowWidth, windowHeight);
    }
  };

  const handleClick = useCallback(() => {
    console.log('FloatingButton: 点击按钮');
    const willExpand = !isExpanded;
    setIsExpanded(willExpand);

    if (willExpand) {
      // 展开时调整窗口大小为聊天界面，并确保在屏幕边界内
      console.log('FloatingButton: 展开窗口');
      adjustWindowPosition(true);
    } else {
      // 收起时恢复小窗口
      console.log('FloatingButton: 收起窗口');
      adjustWindowPosition(false);
    }
  }, [isExpanded]);

  if (isExpanded) {
    // Render expanded state - removed console.log to prevent re-render spam
    return (
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,122,255,0.2)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
        zIndex: 999,
        border: '1px solid rgba(0,122,255,0.1)'
      }}>
        {/* Header */}
        <div
          className="drag-handle"
          onMouseDown={handleMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #E5E7EB',
            borderRadius: '12px 12px 0 0',
            backgroundColor: '#F8F9FA',
            cursor: isDragging ? 'grabbing' : 'grab'
          }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <MessageCircle size={20} color="#007AFF" />
            <span style={{
              fontWeight: '600',
              fontSize: '16px',
              color: '#1F2937'
            }}>AI 助手</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={clearChatHistory}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                color: '#6B7280'
              }}
              title="清除聊天记录"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={handleClick}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                color: '#6B7280'
              }}
              title="最小化"
            >
              <Minimize2 size={16} />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '320px', // 限制最大高度确保滚动正常工作
          scrollBehavior: 'smooth'
        }}>
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: 'flex',
                justifyContent: message.isUser ? 'flex-end' : 'flex-start'
              }}
            >
              <div style={{
                maxWidth: '75%',
                padding: '8px 12px',
                borderRadius: message.isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                backgroundColor: message.isUser ? '#007AFF' : '#F3F4F6',
                color: message.isUser ? 'white' : '#1F2937',
                fontSize: '14px',
                lineHeight: '1.4',
                wordWrap: 'break-word'
              }}>
                {message.text}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-start'
            }}>
              <div style={{
                padding: '8px 12px',
                borderRadius: '16px 16px 16px 4px',
                backgroundColor: '#F3F4F6',
                color: '#6B7280',
                fontSize: '14px',
                fontStyle: 'italic'
              }}>
                正在输入...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{
          padding: '12px',
          borderTop: '1px solid #E5E7EB',
          borderRadius: '0 0 12px 12px'
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end'
          }}>
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="输入消息..."
              style={{
                flex: 1,
                padding: '8px 12px',
                border: isFocused ? '2px solid #007AFF' : '1px solid #D1D5DB',
                borderRadius: '20px',
                fontSize: '14px',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.2s'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isTyping}
              style={{
                backgroundColor: (!inputText.trim() || isTyping) ? '#D1D5DB' : '#007AFF',
                color: 'white',
                border: 'none',
                borderRadius: '20px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (!inputText.trim() || isTyping) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 收起状态 - 显示蓝色圆形按钮 - removed console.log to prevent re-render spam
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '50%'
    }}>
      <button
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: '#007AFF',
          border: '2px solid white',
          cursor: isDragging ? 'grabbing' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isDragging
            ? '0 8px 24px rgba(0,122,255,0.6)'
            : '0 4px 16px rgba(0,122,255,0.4)',
          position: 'relative',
          zIndex: 999,
          transform: isDragging ? 'scale(1.1)' : 'scale(1)',
          transition: isDragging ? 'none' : 'all 0.2s ease'
        }}
        title={isDragging ? '拖拽移动窗口' : '点击打开 AI 聊天 | 拖拽移动窗口'}
      >
        <MessageCircle
          size={24}
          color="white"
        />
      </button>
    </div>
  );
};

// 使用 React.memo 优化组件，防止不必要的重渲染
// FORCE REBUILD - 强制重新构建 - 2025-11-24 15:49
export default memo(FloatingButton);
