import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { MessageCircle, Send, Minimize2, Trash2, ListChecks, AlertCircle, Lightbulb, Heart, FileText, X } from 'lucide-react';

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
  // 根据窗口大小判断初始展开状态，实现状态持久化
  const [isExpanded, setIsExpanded] = useState(() => {
    const isLargeWindow = window.innerWidth > 100 && window.innerHeight > 100;
    return isLargeWindow;
  });
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
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 分类定义
  const categories = [
    { id: 'todo', name: '待办', icon: ListChecks, color: 'bg-blue-100 text-blue-700' },
    { id: 'issue', name: '问题', icon: AlertCircle, color: 'bg-red-100 text-red-700' },
    { id: 'idea', name: '想法', icon: Lightbulb, color: 'bg-yellow-100 text-yellow-700' },
    { id: 'feeling', name: '感受', icon: Heart, color: 'bg-purple-100 text-purple-700' },
    { id: 'note', name: '笔记', icon: FileText, color: 'bg-gray-100 text-gray-700' },
  ];

  // 自动调整输入框高度
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const scrollHeight = inputRef.current.scrollHeight;
      const maxHeight = 120; // 对应maxHeight样式
      inputRef.current.style.height = Math.min(scrollHeight, maxHeight) + 'px';
      inputRef.current.style.overflow = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [inputText]);

  // 加载可用的项目标签 - 从自定义标签中获取
  useEffect(() => {
    const loadAvailableProjects = async () => {
      try {
        // 获取用户创建的自定义标签
        const result = await (window as any).electronAPI?.getCustomTags();
        if (result?.success && result.data) {
          const projects = result.data.map((tag: any) => tag.name);
          setAvailableProjects(projects.sort());
        }
      } catch (error) {
        console.error('Failed to load available projects:', error);
      }
    };

    loadAvailableProjects();
  }, []);

  // 检查并调整窗口位置以确保在屏幕边界内
  const adjustWindowPosition = useCallback((isExpanding: boolean) => {
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
  }, []);

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
    const handler = () => {
      setIsExpanded(true);
      // 调用窗口调整
      adjustWindowPosition(true);
    };

    if ((window as any).electronAPI?.onExpandFloatingWindow) {
      const unsubscribe = (window as any).electronAPI.onExpandFloatingWindow(handler);
      return () => {
        (window as any).electronAPI?.removeExpandFloatingWindowListener?.(unsubscribe);
      };
    } else {
      console.error('FloatingButton: electronAPI 展开事件监听器不可用');
      return () => {};
    }
    // 移除 adjustWindowPosition 依赖，避免不必要的重新注册
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 窗口大小检查已移至 useState 初始化器中，避免额外的 effect

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

  // 创建新项目
  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;

    const projectName = newProjectName.trim();

    // 添加到可用项目列表
    setAvailableProjects(prev => {
      const newProjects = [...prev, projectName].sort();
      return newProjects;
    });

    // 选中新创建的项目
    setSelectedProject(projectName);

    // 重置状态
    setIsCreatingProject(false);
    setNewProjectName('');
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

      // 合并所有标签：智能标签 + 项目标签
      const allTags = [...smartTags];
      if (selectedProject) {
        // 确保项目标签不重复
        if (!allTags.includes(selectedProject)) {
          allTags.push(selectedProject);
        }
      }

      // 使用用户选择的分类作为类型提示
      const type_hint = selectedCategory || undefined;

      const result = await (window as any).electronAPI?.createNote({
        text: content,
        type_hint,
        tags: allTags.length > 0 ? allTags : undefined,
        project_tag: selectedProject || undefined  // 保持向后兼容
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

    // 检查是否需要创建记录 - 只有选择了"待办"分类才创建记录
    const shouldCreateRecord = selectedCategory === 'todo';
    let responseText = '';
    let recordCreated = false;

    // 如果要创建记录且选择了项目标签，在回复中明确说明
    const selectedProjectInfo = selectedProject ? `【项目：${selectedProject}】` : '';

    try {
      if (shouldCreateRecord) {
        // 用户选择了待办分类 - 创建记录
        recordCreated = await createNoteFromChat(currentInput);
        if (recordCreated) {
          responseText = `✅ 我已为您创建了这个待办记录${selectedProjectInfo}，您可以在"我的记录"中查看和管理。`;
        } else {
          responseText = '⚠️ 创建待办记录时遇到问题，请您手动在主应用中添加。';
        }
      } else {
        // 普通AI对话 - 不创建记录，直接回答问题
        const messageType = detectMessageType(currentInput);
        if (messageType === 'question') {
          responseText = await handleQuestionRequest(currentInput);
        } else {
          // 对于非问题的对话，也用AI回复
          responseText = await handleQuestionRequest(currentInput);
        }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 隐藏浮窗
  const handleHideWindow = useCallback(() => {
    console.log('FloatingButton: 隐藏浮窗');
    (window as any).electronAPI?.hideFloatingWindow?.();
  }, []);

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

  // 组件状态变化日志（仅在开发环境）
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('FloatingButton: 状态变化 - isExpanded:', isExpanded);
    }
  }, [isExpanded]);

  if (isExpanded) {
    return (
      <div
        className="floating-button"
        data-floating-button="expanded"
        data-expanded={true}
        style={{
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
        border: '1px solid rgba(0,122,255,0.1)',
        overflow: 'hidden',
        minHeight: '400px'
      }}>
        {/* Header */}
        <div
          className="drag-handle"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #E5E7EB',
            borderRadius: '12px 12px 0 0',
            backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            cursor: 'grab',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            height: '68px',
            minHeight: '68px',
            maxHeight: '68px',
            flexShrink: 0,
            flexGrow: 0,
            flex: '0 0 auto'
          }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <MessageCircle size={18} color="white" />
            </div>
            <span style={{
              fontWeight: '600',
              fontSize: '16px',
              color: 'white',
              letterSpacing: '-0.01em'
            }}>AI 智能助手</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={clearChatHistory}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                color: 'white',
                transition: 'all 0.2s',
                opacity: '0.8'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
              title="清除聊天记录"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={handleClick}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                color: 'white',
                transition: 'all 0.2s',
                opacity: '0.8'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
              title="最小化"
            >
              <Minimize2 size={16} />
            </button>
            <button
              onClick={handleHideWindow}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                color: 'white',
                transition: 'all 0.2s',
                opacity: '0.8'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
              title="隐藏浮窗 (Option+Shift+N)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="messages-area" style={{
          flex: '1 1 auto',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minHeight: 0,
          scrollBehavior: 'smooth',
          backgroundColor: '#F8F9FA'
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
                maxWidth: '80%',
                padding: '12px 16px',
                borderRadius: message.isUser ? '18px 18px 12px 18px' : '18px 18px 18px 12px',
                backgroundColor: message.isUser ?
                  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' :
                  'white',
                background: message.isUser ?
                  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' :
                  'white',
                color: message.isUser ? 'white' : '#1F2937',
                fontSize: '14px',
                lineHeight: '1.5',
                wordWrap: 'break-word',
                boxShadow: message.isUser ?
                  '0 2px 8px rgba(102, 126, 234, 0.3)' :
                  '0 2px 8px rgba(0, 0, 0, 0.1)',
                border: message.isUser ? 'none' : '1px solid #E5E7EB'
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
                borderRadius: '16px 16px 16px 10px',
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
          padding: '16px 20px 20px 20px',
          borderTop: '1px solid #E5E7EB',
          borderRadius: '0 0 12px 12px',
          backgroundColor: 'white',
          flexShrink: 0,
          flexGrow: 0,
          flex: '0 0 auto',
          minHeight: 'auto'
        }}>
          {/* 分类选择器 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{
              fontSize: '10px',
              color: '#6B7280',
              marginBottom: '4px',
              fontWeight: '500'
            }}>分类：</div>
            <div style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'nowrap',
              padding: '6px',
              backgroundColor: '#F8F9FA',
              borderRadius: '8px',
              border: '1px solid #E5E7EB',
              overflowX: 'auto'
            }}>
              {categories.map((category) => {
                const IconComponent = category.icon;
                const isSelected = selectedCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(isSelected ? '' : category.id)}
                    style={{
                      fontSize: '9px',
                      padding: '4px 6px',
                      borderRadius: '6px',
                      border: isSelected ? 'none' : '1px solid #D1D5DB',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: isSelected ?
                        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' :
                        'white',
                      background: isSelected ?
                        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' :
                        'white',
                      color: isSelected ? 'white' : '#6B7280',
                      fontWeight: isSelected ? '500' : '400',
                      boxShadow: isSelected ?
                        '0 2px 4px rgba(102, 126, 234, 0.2)' :
                        '0 1px 2px rgba(0, 0, 0, 0.05)',
                      minWidth: 'fit-content',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <IconComponent style={{ width: '10px', height: '10px' }} />
                    <span>{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 项目标签选择器 */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{
              fontSize: '10px',
              color: '#6B7280',
              marginBottom: '4px',
              fontWeight: '500'
            }}>项目：</div>

            {!isCreatingProject ? (
              <select
                value={selectedProject}
                onChange={(e) => {
                  if (e.target.value === '__CREATE_NEW__') {
                    setIsCreatingProject(true);
                    setSelectedProject('');
                  } else {
                    setSelectedProject(e.target.value);
                  }
                }}
                style={{
                  fontSize: '9px',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  backgroundColor: 'white',
                  color: '#6B7280',
                  fontWeight: '400',
                  cursor: 'pointer',
                  width: '100%',
                  outline: 'none'
                }}
              >
                <option value="">选择项目...</option>
                {availableProjects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
                <option value="__CREATE_NEW__" style={{ color: '#3B82F6', fontWeight: 'bold' }}>
                  + 新增项目
                </option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="输入项目名称..."
                  style={{
                    flex: 1,
                    fontSize: '9px',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: '2px solid #3B82F6',
                    backgroundColor: 'white',
                    color: '#374151',
                    fontWeight: '400',
                    outline: 'none'
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateProject();
                    } else if (e.key === 'Escape') {
                      setIsCreatingProject(false);
                      setNewProjectName('');
                    }
                  }}
                />
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim()}
                  style={{
                    fontSize: '8px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: 'none',
                    backgroundColor: newProjectName.trim() ? '#3B82F6' : '#D1D5DB',
                    color: 'white',
                    cursor: newProjectName.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: '500'
                  }}
                >
                  确定
                </button>
                <button
                  onClick={() => {
                    setIsCreatingProject(false);
                    setNewProjectName('');
                  }}
                  style={{
                    fontSize: '8px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #D1D5DB',
                    backgroundColor: 'white',
                    color: '#6B7280',
                    cursor: 'pointer',
                    fontWeight: '400'
                  }}
                >
                  取消
                </button>
              </div>
            )}
          </div>

          {/* 标签预览 */}
          {(selectedProject || parseSmartTags(inputText).length > 0) && (
            <div style={{
              fontSize: '9px',
              color: '#6B7280',
              marginBottom: '6px',
              padding: '4px 8px',
              backgroundColor: '#F3F4F6',
              borderRadius: '6px',
              border: '1px solid #E5E7EB'
            }}>
              <span style={{ fontWeight: '500', marginRight: '4px' }}>
                将添加标签：
              </span>
              {selectedProject && (
                <span style={{
                  backgroundColor: '#3B82F6',
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  marginRight: '4px',
                  fontSize: '8px',
                  fontWeight: '500'
                }}>
                  📁 {selectedProject}
                </span>
              )}
              {parseSmartTags(inputText).map((tag, index) => (
                <span
                  key={index}
                  style={{
                    backgroundColor: '#10B981',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    marginRight: '4px',
                    fontSize: '8px',
                    fontWeight: '500'
                  }}
                >
                  # {tag}
                </span>
              ))}
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end'
          }}>
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="输入消息... (Enter发送，Shift+Enter换行)"
              rows={1}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: isFocused ?
                  '2px solid transparent' :
                  '1px solid #E5E7EB',
                borderRadius: '12px',
                fontSize: '12px',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
                minHeight: '38px',
                maxHeight: '100px', // 调整相应的最大高度
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                lineHeight: '1.4',
                backgroundColor: '#F8F9FA',
                boxShadow: isFocused ?
                  '0 0 0 2px rgba(102, 126, 234, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)' :
                  '0 1px 3px rgba(0, 0, 0, 0.05)'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isTyping}
              style={{
                background: (!inputText.trim() || isTyping) ?
                  '#D1D5DB' :
                  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: (!inputText.trim() || isTyping) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: (!inputText.trim() || isTyping) ?
                  'none' :
                  '0 2px 8px rgba(102, 126, 234, 0.3)',
                transform: (!inputText.trim() || isTyping) ? 'none' : 'translateY(-1px)'
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 收起状态 - 显示蓝色圆形按钮
  return (
    <div
      className="floating-button"
      data-floating-button="collapsed"
      data-expanded={false}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
        borderRadius: '50%'
      }}>
      <button
        onClick={handleClick}
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          backgroundColor: '#007AFF',
          border: '2px solid white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,122,255,0.4)',
          position: 'relative',
          zIndex: 999,
          transform: 'scale(1)',
          transition: 'all 0.2s ease'
        }}
        title="点击打开 AI 聊天 | 拖拽移动窗口"
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
