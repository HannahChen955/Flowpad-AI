import React, { useState, useEffect, useRef } from 'react';
import { Send, X, Bot, FileText, Sparkles, CheckCircle, XCircle } from 'lucide-react';

type Mode = 'quick' | 'ai';
type AICategory = 'todo' | 'idea' | 'note' | 'feeling' | 'issue';

interface AIUnderstanding {
  category: AICategory;
  confidence: number;
  extractedText: string;
  tags: string[];
}

const FloatingWindow: React.FC = () => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>('ai');
  const [aiUnderstanding, setAiUnderstanding] = useState<AIUnderstanding | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动聚焦
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // AI分析文本
  const analyzeText = async (inputText: string) => {
    if (!inputText.trim() || mode !== 'ai') return;

    setIsAnalyzing(true);
    try {
      const result = await (window as any).electronAPI.processAssistantChat(
        `请分析以下文本并提取信息，返回JSON格式：
        文本："${inputText.trim()}"

        请返回以下格式的JSON：
        {
          "category": "todo|idea|note|feeling|issue",
          "confidence": 0-100,
          "extractedText": "提取的文本内容",
          "tags": ["相关标签"]
        }`
      );

      if (result.success && result.data?.message) {
        try {
          const jsonMatch = result.data.message.match(/\{[^}]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            setAiUnderstanding({
              category: analysis.category || 'note',
              confidence: analysis.confidence || 80,
              extractedText: analysis.extractedText || inputText.trim(),
              tags: analysis.tags || []
            });
            setShowConfirmation(true);
          }
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError);
          setAiUnderstanding({
            category: 'note',
            confidence: 70,
            extractedText: inputText.trim(),
            tags: []
          });
          setShowConfirmation(true);
        }
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      // AI失败时降级到快速模式
      setMode('quick');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 监听文本变化，延迟分析
  useEffect(() => {
    if (mode === 'ai' && text.trim() && text.length > 10) {
      const timer = setTimeout(() => {
        analyzeText(text);
      }, 1500); // 1.5秒延迟

      return () => clearTimeout(timer);
    }
  }, [text, mode]);

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConfirmation) {
          setShowConfirmation(false);
          setAiUnderstanding(null);
        } else {
          handleClose();
        }
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (mode === 'ai' && showConfirmation) {
          confirmAISubmit();
        } else {
          handleSubmit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [text, mode, showConfirmation]);

  const confirmAISubmit = async () => {
    if (!aiUnderstanding || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const result = await (window as any).electronAPI.createNote({
        text: aiUnderstanding.extractedText,
        type_hint: aiUnderstanding.category,
        tags: aiUnderstanding.tags
      });

      if (result.success) {
        setText('');
        setAiUnderstanding(null);
        setShowConfirmation(false);
        handleClose();
      } else {
        alert('保存失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('保存失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;

    // AI模式且有确认信息时，使用AI提交
    if (mode === 'ai' && aiUnderstanding && showConfirmation) {
      return confirmAISubmit();
    }

    setIsSubmitting(true);
    try {
      const result = await (window as any).electronAPI.createNote({
        text: text.trim()
      });

      if (result.success) {
        setText('');
        handleClose();
      } else {
        alert('保存失败：' + result.error);
      }
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('保存失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    (window as any).electronAPI.hideFloatingWindow();
  };

  const getCategoryIcon = (category: AICategory) => {
    switch (category) {
      case 'todo': return '✅';
      case 'idea': return '💡';
      case 'feeling': return '💭';
      case 'issue': return '⚠️';
      default: return '📝';
    }
  };

  const getCategoryName = (category: AICategory) => {
    switch (category) {
      case 'todo': return '待办';
      case 'idea': return '想法';
      case 'feeling': return '感受';
      case 'issue': return '问题';
      default: return '笔记';
    }
  };

  const getCategoryColor = (category: AICategory) => {
    switch (category) {
      case 'todo': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'idea': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'feeling': return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'issue': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="w-full h-full p-4">
      <div className="floating-card p-4 w-full h-full flex flex-col slide-up">
        {/* 头部：模式切换 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setMode('ai')}
                className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-colors ${
                  mode === 'ai'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                title="AI智能模式"
              >
                <Bot className="w-3 h-3" />
                <span>AI</span>
              </button>
              <button
                onClick={() => setMode('quick')}
                className={`flex items-center space-x-1 px-2 py-1 text-xs rounded transition-colors ${
                  mode === 'quick'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
                title="快速记录模式"
              >
                <FileText className="w-3 h-3" />
                <span>快速</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AI理解显示区域 */}
        {mode === 'ai' && showConfirmation && aiUnderstanding && (
          <div className={`mb-3 p-3 rounded-lg border ${getCategoryColor(aiUnderstanding.category)}`}>
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-lg">{getCategoryIcon(aiUnderstanding.category)}</span>
              <span className="text-sm font-medium">{getCategoryName(aiUnderstanding.category)}</span>
              <span className="text-xs opacity-70">({aiUnderstanding.confidence}% 确信度)</span>
            </div>
            <p className="text-sm">{aiUnderstanding.extractedText}</p>
            {aiUnderstanding.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {aiUnderstanding.tags.map((tag, index) => (
                  <span key={index} className="text-xs px-2 py-1 bg-white/50 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === 'ai'
              ? "用自然语言描述你的想法，AI会帮你整理... (⌘Enter 保存，Esc 关闭)"
              : "记录你的想法... (⌘Enter 保存，Esc 关闭)"
          }
          className="flex-1 resize-none border-0 outline-none placeholder-gray-400 text-sm bg-transparent"
          rows={mode === 'ai' && showConfirmation ? 3 : 4}
        />

        {/* AI分析状态 */}
        {mode === 'ai' && isAnalyzing && (
          <div className="flex items-center space-x-2 text-xs text-gray-500 mb-2">
            <Sparkles className="w-3 h-3 animate-pulse" />
            <span>AI正在理解中...</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="text-xs text-gray-500">
              {text.length} 字符
            </div>
            {mode === 'ai' && (
              <div className="text-xs text-gray-500">
                {text.length > 10 ? '✨ AI分析中' : '继续输入以启用AI分析'}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {mode === 'ai' && showConfirmation && aiUnderstanding && (
              <>
                <button
                  onClick={() => {
                    setShowConfirmation(false);
                    setAiUnderstanding(null);
                  }}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors flex items-center space-x-1"
                >
                  <XCircle className="w-3 h-3" />
                  <span>修改</span>
                </button>
                <button
                  onClick={confirmAISubmit}
                  disabled={isSubmitting}
                  className="btn-primary text-xs px-3 py-1 flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3" />
                  )}
                  <span>{isSubmitting ? '保存中...' : '确认保存'}</span>
                </button>
              </>
            )}

            {(!showConfirmation || mode === 'quick') && (
              <>
                <button
                  onClick={handleClose}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!text.trim() || isSubmitting}
                  className="btn-primary text-xs px-3 py-1 flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  <span>{isSubmitting ? '保存中...' : '保存'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FloatingWindow;