import { Context } from './types';
import activeWin from 'active-win';

export class ContextCapture {
  /**
   * 获取当前激活窗口的上下文信息
   * 使用 active-win 库获取真实的活动窗口信息，增加了错误处理和超时机制
   */
  async getCurrentContext(): Promise<Context | null> {
    try {
      // 使用超时和重试机制处理 active-win 的不稳定性
      const activeWindow = await this.getActiveWindowWithRetry();

      if (!activeWindow) {
        console.warn('No active window detected after retries');
        return this.getFallbackContext();
      }

      // 验证返回的数据结构
      if (!activeWindow.owner || typeof activeWindow.owner.name !== 'string') {
        console.warn('Invalid active window data structure');
        return this.getFallbackContext();
      }

      // 构建上下文信息
      const context: Context = {
        app_name: activeWindow.owner.name,
        window_title: activeWindow.title || '',
        url: (activeWindow as any).url || this.extractURL(activeWindow.title, activeWindow.owner.name),
      };

      console.log('Captured context:', {
        app: context.app_name,
        title: context.window_title?.substring(0, 50) + (context.window_title && context.window_title.length > 50 ? '...' : ''),
        url: context.url,
        bundleId: (activeWindow.owner as any).bundleId
      });

      return context;
    } catch (error) {
      console.error('Failed to get current context:', error);

      // 如果是 EPIPE 错误，可能是 active-win 的进程通信问题
      if (error instanceof Error && error.message.includes('EPIPE')) {
        console.warn('active-win EPIPE error detected, using fallback context');
      }

      return this.getFallbackContext();
    }
  }

  /**
   * 使用重试机制获取活动窗口信息
   */
  private async getActiveWindowWithRetry(maxRetries: number = 2): Promise<any> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 为每次尝试设置超时
        const result = await Promise.race([
          activeWin(),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('active-win timeout')), 3000)
          )
        ]);

        if (result) {
          return result;
        }
      } catch (error) {
        console.warn(`active-win attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : error);

        // 如果不是最后一次尝试，等待一小段时间再重试
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          throw error;
        }
      }
    }
    return null;
  }

  /**
   * 返回降级的上下文信息
   */
  private getFallbackContext(): Context {
    return {
      app_name: 'Unknown Application',
      window_title: 'Context capture unavailable',
      url: undefined,
    };
  }


  /**
   * 从窗口标题和应用名称中提取URL（主要针对浏览器）
   * 改进后支持更多浏览器标题格式和URL模式
   */
  private extractURL(title?: string, appName?: string): string | undefined {
    if (!title || !appName) return undefined;

    // 支持的浏览器列表
    const browserApps = [
      'Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Arc',
      'Opera', 'Brave Browser', 'Vivaldi', 'Chrome', 'Edge'
    ];

    const isBrowser = browserApps.some(browser =>
      appName.toLowerCase().includes(browser.toLowerCase())
    );

    if (!isBrowser) return undefined;

    // 多种URL提取策略
    const urlExtractionStrategies = [
      // 策略1: 提取完整的 HTTP(S) URL
      /https?:\/\/[^\s\)]+/i,

      // 策略2: 常见开发平台和网站
      /(?:github|gitlab|stackoverflow|localhost|127\.0\.0\.1|.*\.dev|.*\.local)(?:\.com|\.org|\.io|:\d+)?[^\s\)]*(?:\/[^\s\)]*)?/i,

      // 策略3: 从标题分隔符中提取（很多浏览器用 " - " 或 " | " 分隔网站名称）
      () => {
        const separators = [' - ', ' | ', ' • ', ' · ', ' — '];
        for (const sep of separators) {
          if (title.includes(sep)) {
            const parts = title.split(sep);
            const lastPart = parts[parts.length - 1].trim();
            // 检查最后一部分是否看起来像域名或网站
            if (/[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(lastPart)) {
              return lastPart;
            }
          }
        }
        return null;
      },

      // 策略4: 通用域名模式
      /(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/i
    ];

    for (const strategy of urlExtractionStrategies) {
      let match: string | null = null;

      if (typeof strategy === 'function') {
        match = strategy();
      } else {
        const regexMatch = title.match(strategy);
        match = regexMatch ? regexMatch[0] : null;
      }

      if (match) {
        // 清理提取的URL
        const cleanUrl = match.replace(/[)\]}>]+$/, '').trim();
        if (cleanUrl.length > 3) {
          return cleanUrl;
        }
      }
    }

    return undefined;
  }

  /**
   * 检测是否在代码编辑器中
   * 扩展支持更多常用的代码编辑器和IDE
   */
  isInCodeEditor(appName?: string): boolean {
    if (!appName) return false;

    const codeEditors = [
      // 主流编辑器
      'Visual Studio Code', 'Cursor', 'Code', 'VSCode',
      // JetBrains 系列
      'WebStorm', 'IntelliJ IDEA', 'PyCharm', 'PhpStorm', 'GoLand', 'RubyMine', 'CLion',
      // 其他流行编辑器
      'Sublime Text', 'Atom', 'Brackets', 'Notepad++',
      // Vim/Emacs
      'MacVim', 'Emacs', 'Vim',
      // 其他IDE
      'Xcode', 'Eclipse', 'NetBeans', 'Android Studio',
      // 新兴编辑器
      'Zed', 'Nova', 'Lapce'
    ];

    return codeEditors.some(editor =>
      appName.toLowerCase().includes(editor.toLowerCase())
    );
  }

  /**
   * 检测是否在浏览器中
   */
  isInBrowser(appName?: string): boolean {
    if (!appName) return false;

    const browsers = [
      'Google Chrome', 'Safari', 'Firefox', 'Microsoft Edge', 'Arc',
      'Opera', 'Brave Browser', 'Vivaldi', 'Chrome', 'Edge'
    ];
    return browsers.some(browser =>
      appName.toLowerCase().includes(browser.toLowerCase())
    );
  }

  /**
   * 从Git项目中提取项目信息（需要在主进程中实现）
   * 注意：这个功能留待后续在Electron主进程中实现
   */
  async getGitProjectInfo(_workingDir?: string): Promise<{
    projectName?: string;
    branch?: string;
    lastCommit?: string;
  } | null> {
    // 这个功能需要在Electron主进程中实现
    // 因为需要访问文件系统和执行Git命令
    // TODO: 实现Git仓库检测和信息提取
    return null;
  }

  /**
   * 获取增强的上下文信息，包含应用类型和环境判断
   */
  async getEnhancedContext(): Promise<Context & {
    appType?: 'browser' | 'code_editor' | 'other';
    isDevEnvironment?: boolean;
  } | null> {
    const basicContext = await this.getCurrentContext();
    if (!basicContext) return null;

    const appName = basicContext.app_name;

    return {
      ...basicContext,
      appType: this.isInBrowser(appName) ? 'browser'
             : this.isInCodeEditor(appName) ? 'code_editor'
             : 'other',
      isDevEnvironment: this.isInCodeEditor(appName) ||
                       (!!basicContext.url && this.isDevUrl(basicContext.url))
    };
  }

  /**
   * 判断URL是否为开发环境相关
   */
  private isDevUrl(url?: string): boolean {
    if (!url) return false;

    const devPatterns = [
      /localhost/i,
      /127\.0\.0\.1/i,
      /\.local/i,
      /:\d{4,5}/, // 端口号模式
      /\.dev/i,
      /staging\./i,
      /dev\./i
    ];

    return devPatterns.some(pattern => pattern.test(url));
  }
}