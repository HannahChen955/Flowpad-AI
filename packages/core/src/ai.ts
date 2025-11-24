import { Note, AIConfig, DailyDigest, ProjectSummary, AssistantResponse } from './types';

export class AIService {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  /**
   * 生成每日总结
   */
  async generateDailyDigest(notes: Note[]): Promise<string> {
    if (notes.length === 0) {
      return '今日暂无记录';
    }

    const prompt = this.buildDailyDigestPrompt(notes);

    try {
      const response = await this.callLLM(prompt);
      return response;
    } catch (error) {
      console.error('Failed to generate daily digest:', error);
      return '生成总结时出现错误，请稍后重试';
    }
  }

  /**
   * 构建每日总结的提示词
   */
  private buildDailyDigestPrompt(notes: Note[]): string {
    const notesData = notes.map(note => ({
      text: note.text,
      created_at: note.created_at,
      app_name: note.app_name,
      window_title: note.window_title,
      project_hint: note.project_hint,
      type_hint: note.type_hint,
    }));

    return `你是一个智能助手，帮助知识工作者总结一天的笔记和想法。

输入数据：
${JSON.stringify(notesData, null, 2)}

请根据以下要求生成总结：

1. 按项目/主题分组，总结：
   - 今日进展：完成了什么工作
   - 问题与风险：遇到的困难或需要关注的问题
   - 关键想法：记录的灵感或决策

2. 提取明确的待办清单：
   - 只包括面向未来的具体行动项
   - 每个待办要包含足够的上下文信息
   - 按优先级排序

3. 生成简短的复盘反思：
   - 基于情绪和感受类的记录
   - 关于工作节奏、心态、关注点的总结
   - 保持支持性和中性的语调

输出格式（Markdown，简洁明了）：

# 今日项目概览

## [项目/主题名]
- **今日进展**：...
- **问题与风险**：...
- **关键想法**：...

# 待办清单
- [ ] [项目] 具体行动项
- [ ] [项目] 具体行动项

# 今日复盘
- 关于工作节奏的观察...
- 关于心态调整的建议...

请保持总结简洁、实用，重点关注可操作的信息。`;
  }

  /**
   * 调用大语言模型API
   */
  private async callLLM(prompt: string): Promise<string> {
    const { provider, api_key, model } = this.config;

    if (provider === 'openai') {
      return this.callOpenAI(prompt, api_key, model || 'gpt-4');
    } else if (provider === 'qwen') {
      return this.callQwen(prompt, api_key, model || 'qwen-max');
    }

    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  /**
   * 调用OpenAI API
   */
  private async callOpenAI(prompt: string, apiKey: string, model: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '生成总结失败';
  }

  /**
   * 调用阿里千问API
   */
  private async callQwen(prompt: string, apiKey: string, model: string): Promise<string> {
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'disable',
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            { role: 'user', content: prompt }
          ]
        },
        parameters: {
          temperature: 0.7,
          max_tokens: 2000,
          result_format: 'message'
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Qwen API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.output?.choices?.[0]?.message?.content || '生成总结失败';
  }

  /**
   * 更新AI配置
   */
  updateConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 验证API配置是否有效
   */
  async validateConfig(): Promise<boolean> {
    try {
      const testPrompt = '请回复"配置正常"';
      const response = await this.callLLM(testPrompt);
      return response.includes('配置正常') || response.includes('正常');
    } catch (error) {
      console.error('AI config validation failed:', error);
      return false;
    }
  }

  /**
   * AI助手对话 - 处理用户输入并执行笔记操作
   */
  async processAssistantChat(userInput: string, notes: Note[]): Promise<AssistantResponse> {
    try {
      // 构建系统提示词，包含笔记操作能力
      const systemPrompt = this.buildAssistantSystemPrompt(notes);
      const userPrompt = `用户输入：${userInput}`;

      const response = await this.callLLM(`${systemPrompt}\n\n${userPrompt}`);

      // 解析AI返回的结构化响应
      return this.parseAssistantResponse(response);
    } catch (error) {
      console.error('Assistant chat error:', error);
      return {
        message: '抱歉，我现在无法处理您的请求，请稍后再试。',
        actions: []
      };
    }
  }

  /**
   * 构建AI助手的系统提示词
   */
  private buildAssistantSystemPrompt(notes: Note[]): string {
    const recentNotes = notes.slice(0, 20); // 只包含最近20条笔记作为上下文

    return `你是Flowpad记事本的AI助手。你可以帮助用户管理笔记，包括：
1. 创建新笔记（支持分类：待办、问题、想法、感受、笔记）
2. 搜索和查找笔记
3. 删除笔记
4. 分类和整理笔记
5. 总结和分析笔记内容

当前笔记库概览：
- 总计：${notes.length}条笔记
- 最近笔记：${recentNotes.map(note =>
  `[${note.type_hint || '笔记'}] ${note.text.slice(0, 50)}...`
).join('\n- ')}

分类说明：
- todo: 待办事项
- issue: 问题/bug
- idea: 想法/创意
- feeling: 感受/心情
- note: 普通笔记

项目标签：可以为笔记添加项目标签进行分组管理。

响应格式要求：
请以JSON格式返回，包含以下字段：
{
  "message": "对用户的回复消息",
  "actions": [
    {
      "type": "create|search|delete|update|analyze",
      "params": {
        // 根据操作类型包含相应参数
        // create: { text, type_hint?, tags? }
        // search: { query, type_hint?, tags? }
        // delete: { noteIds }
        // analyze: { noteIds }
      }
    }
  ]
}

请用友好、专业的语调与用户交流，理解用户意图并提供有用的建议。`;
  }

  /**
   * 解析AI助手的响应
   */
  private parseAssistantResponse(response: string): AssistantResponse {
    try {
      // 尝试提取JSON部分
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          message: parsed.message || response,
          actions: parsed.actions || []
        };
      }

      // 如果没有找到JSON格式，返回纯文本响应
      return {
        message: response,
        actions: []
      };
    } catch (error) {
      console.error('Failed to parse assistant response:', error);
      return {
        message: response,
        actions: []
      };
    }
  }

  /**
   * AI内容优化 - 将随意输入的内容整理成有层次的文本格式
   */
  async optimizeContent(rawContent: string): Promise<string> {
    try {
      const systemPrompt = `你是一个专业的内容编辑助手。你的任务是将用户随意输入的内容整理成结构清晰、层次分明的纯文本格式。

核心要求：
1. 保持原始内容的核心意思和重要信息不变
2. 使用简洁的纯文本结构组织内容
3. 绝对不要使用任何标记符号：包括但不限于 # * - [] () 》 • ★ ▪ ○ ■ 等
4. 使用自然的文字描述和缩进来表达层次关系
5. 保持简洁，不要添加原内容中没有的信息
6. 中文内容请保持中文输出
7. 长度控制在原内容的1.2倍以内

格式示例：
输入："明天要开会讨论项目进展，需要准备PPT，还要整理一下用户反馈的问题"
输出：

明天会议准备

主要议题
  项目进展讨论

需要完成的任务
  准备PPT演示文稿
  整理用户反馈问题

备注
  会议重点关注项目当前状态和用户体验改进

注意：使用缩进和换行来表达结构，完全避免使用任何符号标记。

现在请优化以下内容：`;

      const userPrompt = `原始内容：\n${rawContent}`;

      const response = await this.callLLM(`${systemPrompt}\n\n${userPrompt}`);

      // 移除可能的引号包裹
      let cleanResponse = response.replace(/^["']|["']$/g, '').trim();

      // 彻底移除所有markdown和符号标记
      cleanResponse = cleanResponse
        .replace(/^#{1,6}\s*/gm, '') // 移除标题标记
        .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记
        .replace(/\*(.*?)\*/g, '$1') // 移除斜体标记
        .replace(/\[(.*?)\]/g, '$1') // 移除方括号
        .replace(/`([^`]*)`/g, '$1') // 移除代码标记
        .replace(/^>\s*/gm, '') // 移除引用标记
        .replace(/^[-*+]\s*/gm, '  ') // 将列表符号替换为缩进
        .replace(/^(\s*)•\s*/gm, '$1  ') // 将圆点替换为缩进
        .replace(/^(\s*)[★▪○■▲●]\s*/gm, '$1  ') // 移除其他符号
        .replace(/^\s*[\d]+\.\s*/gm, '  ') // 移除数字列表
        .replace(/【|】/g, '') // 移除中文方括号
        .replace(/《|》/g, '') // 移除书名号
        .replace(/^\s*[\-=]{2,}\s*$/gm, '') // 移除分割线
        .replace(/\n{3,}/g, '\n\n') // 清理多余空行
        .trim();

      return cleanResponse;
    } catch (error) {
      console.error('Content optimization error:', error);
      // 如果AI处理失败，返回原内容
      return rawContent;
    }
  }
}